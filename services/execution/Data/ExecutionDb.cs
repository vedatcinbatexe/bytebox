using Microsoft.EntityFrameworkCore;

namespace Execution.Data;

public class ExecutionDb(DbContextOptions<ExecutionDb> options) : DbContext(options)
{
    public DbSet<Run> Runs => Set<Run>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Run>(run =>
        {
            run.ToTable("runs");
            run.HasIndex(r => r.UserId);
            run.HasIndex(r => r.CreatedAt);
        });
    }
}
