using System.Net.Http.Headers;
using System.Text.Json.Serialization;

namespace Identity.Auth;

// Google sign-in (OAuth 2.0 / OpenID Connect)
public class GoogleClient(HttpClient http, IConfiguration config) : IOAuthProvider
{
    private readonly string _clientId = config["Google:ClientId"] ?? "";
    private readonly string _clientSecret = config["Google:ClientSecret"] ?? "";
    private readonly string _redirectUri = $"{config["PublicUrl"] ?? "http://localhost:5001"}/auth/google/callback";

    public string Name => "google";
    public bool IsConfigured => _clientId != "" && _clientSecret != "";

    public string AuthorizeUrl(string state) =>
        "https://accounts.google.com/o/oauth2/v2/auth" +
        $"?client_id={Uri.EscapeDataString(_clientId)}" +
        $"&redirect_uri={Uri.EscapeDataString(_redirectUri)}" +
        "&response_type=code" +
        "&scope=openid%20email%20profile" +
        "&prompt=select_account" + // let people pick which Google account to use
        $"&state={Uri.EscapeDataString(state)}";

    // Exchange the code for an access token, then read the user's profile
    public async Task<ExternalProfile?> GetProfileAsync(string code)
    {
        var tokenResponse = await http.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(
            new Dictionary<string, string>
            {
                ["client_id"] = _clientId,
                ["client_secret"] = _clientSecret,
                ["code"] = code,
                ["redirect_uri"] = _redirectUri,
                ["grant_type"] = "authorization_code",
            }));
        if (!tokenResponse.IsSuccessStatusCode) return null;
        var token = await tokenResponse.Content.ReadFromJsonAsync<AccessTokenResponse>();
        if (string.IsNullOrEmpty(token?.AccessToken)) return null;

        var userRequest = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
        userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        var userResponse = await http.SendAsync(userRequest);
        if (!userResponse.IsSuccessStatusCode) return null;

        var user = await userResponse.Content.ReadFromJsonAsync<GoogleUser>();
        if (user is null || string.IsNullOrEmpty(user.Subject)) return null;

        // Google has no user names, so use the part of the email before the @
        var login = user.Email?.Split('@')[0] ?? user.Subject;
        return new ExternalProfile(Name, user.Subject, login, user.Name, user.Picture ?? "");
    }

    private record AccessTokenResponse([property: JsonPropertyName("access_token")] string? AccessToken);

    private record GoogleUser(
        [property: JsonPropertyName("sub")] string Subject,
        [property: JsonPropertyName("email")] string? Email,
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("picture")] string? Picture);
}
