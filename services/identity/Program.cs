using System.Security.Cryptography;
using System.Text;
using Identity.Auth;
using Identity.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Services.AddDbContext<IdentityDb>(options => options.UseNpgsql(config.GetConnectionString("Postgres")));
builder.Services.AddHttpClient<GitHubClient>();
builder.Services.AddSingleton<SessionTokens>();

var app = builder.Build();

// Apply EF Core migrations (Migrations/) on startup
using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<IdentityDb>().Database.MigrateAsync();
}

var webUrl = config["WebUrl"] ?? "http://localhost:3000";
var secureCookies = config.GetValue("Cookie:Secure", false); // true when served over HTTPS
const string StateCookie = "bytebox_oauth_state";
const string ReturnCookie = "bytebox_return_to";

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "identity" }));

// 1. Send the user to GitHub. A random "state" protects against forged login requests.
app.MapGet("/auth/github/login", (HttpContext http, GitHubClient github, string? returnTo) =>
{
    if (!github.IsConfigured) return Results.Redirect($"{webUrl}/login?error=not-configured");

    var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    SetTemporaryCookie(http, StateCookie, state);
    SetTemporaryCookie(http, ReturnCookie, SafePath(returnTo));
    return Results.Redirect(github.AuthorizeUrl(state));
});

// 2. GitHub sends the user back here with a one-time code
app.MapGet("/auth/github/callback", async (
    HttpContext http, GitHubClient github, IdentityDb db, SessionTokens tokens, string? code, string? state) =>
{
    var expectedState = http.Request.Cookies[StateCookie];
    var returnTo = SafePath(http.Request.Cookies[ReturnCookie]);
    http.Response.Cookies.Delete(StateCookie);
    http.Response.Cookies.Delete(ReturnCookie);

    if (code is null || state is null || expectedState is null ||
        !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(state), Encoding.UTF8.GetBytes(expectedState)))
    {
        return Results.Redirect($"{webUrl}/login?error=failed");
    }

    var profile = await github.GetProfileAsync(code);
    if (profile is null) return Results.Redirect($"{webUrl}/login?error=failed");

    var user = await SaveUserAsync(db, profile);
    SetSessionCookie(http, tokens.Issue(user));
    return Results.Redirect(webUrl + returnTo);
});

app.MapGet("/auth/logout", (HttpContext http, string? returnTo) =>
{
    http.Response.Cookies.Delete(SessionTokens.CookieName);
    return Results.Redirect(webUrl + SafePath(returnTo));
});

// Local development and tests only: log in as any user name without GitHub
if (config.GetValue("DevLogin:Enabled", false))
{
    app.Logger.LogWarning("Dev login is enabled. Never enable it in production.");
    app.MapGet("/auth/dev/login", async (HttpContext http, IdentityDb db, SessionTokens tokens, string login, string? returnTo) =>
    {
        // Negative ids can't clash with real GitHub users
        var id = -Math.Abs(BitConverter.ToInt64(SHA256.HashData(Encoding.UTF8.GetBytes(login)), 0));
        var user = await SaveUserAsync(db, new GitHubProfile(id, login, login, ""));
        SetSessionCookie(http, tokens.Issue(user));
        return Results.Redirect(webUrl + SafePath(returnTo));
    });
}

app.Run();

async Task<User> SaveUserAsync(IdentityDb db, GitHubProfile profile)
{
    var now = DateTime.UtcNow;
    var user = await db.Users.FirstOrDefaultAsync(u => u.GitHubId == profile.Id);
    if (user is null)
    {
        user = new User { Id = Guid.NewGuid(), GitHubId = profile.Id, CreatedAt = now };
        db.Users.Add(user);
    }
    user.Login = profile.Login;
    user.Name = profile.Name;
    user.AvatarUrl = profile.AvatarUrl;
    user.LastLoginAt = now;
    await db.SaveChangesAsync();
    return user;
}

void SetSessionCookie(HttpContext http, string token)
{
    http.Response.Cookies.Append(SessionTokens.CookieName, token, new CookieOptions
    {
        HttpOnly = true, // JavaScript can't read it
        Secure = secureCookies,
        SameSite = SameSiteMode.Lax,
        Path = "/",
        MaxAge = SessionTokens.Lifetime,
    });
}

void SetTemporaryCookie(HttpContext http, string name, string value)
{
    http.Response.Cookies.Append(name, value, new CookieOptions
    {
        HttpOnly = true,
        Secure = secureCookies,
        SameSite = SameSiteMode.Lax, // sent on the redirect back from GitHub
        Path = "/auth",
        MaxAge = TimeSpan.FromMinutes(10),
    });
}

// Only allow redirects to a page of our own web portal (e.g. "/p/abc"), never to another site
static string SafePath(string? path)
{
    return path is { Length: > 0 } && path.StartsWith('/') && !path.StartsWith("//") && !path.Contains('\\')
        ? path
        : "/";
}
