using System.Net.Http.Headers;
using System.Text.Json.Serialization;

namespace Identity.Auth;

public record GitHubProfile(
    [property: JsonPropertyName("id")] long Id,
    [property: JsonPropertyName("login")] string Login,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("avatar_url")] string AvatarUrl);

// Talks to GitHub for the OAuth "authorization code" flow
public class GitHubClient(HttpClient http, IConfiguration config)
{
    private readonly string _clientId = config["GitHub:ClientId"] ?? "";
    private readonly string _clientSecret = config["GitHub:ClientSecret"] ?? "";
    private readonly string _redirectUri = $"{config["PublicUrl"] ?? "http://localhost:5001"}/auth/github/callback";

    public bool IsConfigured => _clientId != "" && _clientSecret != "";

    public string AuthorizeUrl(string state) =>
        "https://github.com/login/oauth/authorize" +
        $"?client_id={Uri.EscapeDataString(_clientId)}" +
        $"&redirect_uri={Uri.EscapeDataString(_redirectUri)}" +
        "&scope=read:user" +
        $"&state={Uri.EscapeDataString(state)}";

    // Exchange the code from GitHub's redirect for an access token, then read the user's profile
    public async Task<GitHubProfile?> GetProfileAsync(string code)
    {
        var tokenRequest = new HttpRequestMessage(HttpMethod.Post, "https://github.com/login/oauth/access_token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _clientId,
                ["client_secret"] = _clientSecret,
                ["code"] = code,
                ["redirect_uri"] = _redirectUri,
            }),
        };
        tokenRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        var tokenResponse = await http.SendAsync(tokenRequest);
        var token = await tokenResponse.Content.ReadFromJsonAsync<AccessTokenResponse>();
        if (string.IsNullOrEmpty(token?.AccessToken)) return null;

        var userRequest = new HttpRequestMessage(HttpMethod.Get, "https://api.github.com/user");
        userRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.AccessToken);
        userRequest.Headers.UserAgent.Add(new ProductInfoHeaderValue("Bytebox", "1.0"));
        userRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        var userResponse = await http.SendAsync(userRequest);
        if (!userResponse.IsSuccessStatusCode) return null;
        return await userResponse.Content.ReadFromJsonAsync<GitHubProfile>();
    }

    private record AccessTokenResponse([property: JsonPropertyName("access_token")] string? AccessToken);
}
