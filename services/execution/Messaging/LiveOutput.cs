using System.Text.Json;
using StackExchange.Redis;

namespace Execution.Messaging;

// Output of a run that is still going, kept in Redis for a short time
public record LiveOutput(string Stdout, string Stderr)
{
    private static readonly TimeSpan KeepFor = TimeSpan.FromMinutes(10);

    public static RedisKey Key(Guid runId) => $"run:{runId}:live";

    public static async Task SaveAsync(IDatabase redis, Guid runId, LiveOutput output) =>
        await redis.StringSetAsync(Key(runId), JsonSerializer.Serialize(output), KeepFor);

    public static async Task<LiveOutput?> LoadAsync(IDatabase redis, Guid runId)
    {
        var value = await redis.StringGetAsync(Key(runId));
        return value.HasValue ? JsonSerializer.Deserialize<LiveOutput>(value.ToString()) : null;
    }
}
