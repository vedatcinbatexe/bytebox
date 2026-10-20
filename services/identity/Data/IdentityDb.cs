using Microsoft.EntityFrameworkCore;

namespace Identity.Data;

public class IdentityDb(DbContextOptions<IdentityDb> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(user =>
        {
            user.ToTable("users");
            user.HasIndex(u => u.GitHubId).IsUnique();
            user.HasIndex(u => u.GoogleId).IsUnique();
        });
    }
}
