using System.Text;
using Identity.Data;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Identity.Auth;

// Issues the signed session token (JWT) stored in the session cookie. The gateway verifies it with the same secret.
public class SessionTokens(IConfiguration config)
{
    public const string CookieName = "bytebox_session";
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    private readonly SymmetricSecurityKey _key = new(Encoding.UTF8.GetBytes(
        config["Jwt:Secret"] is { Length: >= 32 } secret
            ? secret
            : throw new InvalidOperationException("Jwt:Secret must be at least 32 characters")));

    public string Issue(User user)
    {
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "bytebox-identity",
            Expires = DateTime.UtcNow.Add(Lifetime),
            SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.HmacSha256),
            Claims = new Dictionary<string, object>
            {
                ["sub"] = user.Id.ToString(),
                ["login"] = user.Login,
                ["name"] = user.Name ?? user.Login,
                ["avatar"] = user.AvatarUrl,
            },
        });
    }
}
