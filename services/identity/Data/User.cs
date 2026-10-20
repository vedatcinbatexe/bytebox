namespace Identity.Data;

public class User
{
    public Guid Id { get; set; }

    // Exactly one of these is set: the account the user signed in with
    public long? GitHubId { get; set; }
    public string? GoogleId { get; set; }

    public string Login { get; set; } = "";
    public string? Name { get; set; }
    public string AvatarUrl { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime LastLoginAt { get; set; }
}
