namespace Identity.Auth;

// What we keep from a GitHub or Google account
public record ExternalProfile(string Provider, string ProviderUserId, string Login, string? Name, string AvatarUrl);

// One "Sign in with ..." provider using the OAuth authorization code flow
public interface IOAuthProvider
{
    string Name { get; } // "github" or "google", used in /auth/{name}/login
    bool IsConfigured { get; }
    string AuthorizeUrl(string state);
    Task<ExternalProfile?> GetProfileAsync(string code);
}
