namespace Identity.Data;

public class User
{
    public Guid Id { get; set; }
    public long GitHubId { get; set; }
    public string Login { get; set; } = "";
    public string? Name { get; set; }
    public string AvatarUrl { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime LastLoginAt { get; set; }
}
