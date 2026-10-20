using System.Text.Json;
using Execution.Data;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using StackExchange.Redis;

namespace Execution.Messaging;

// Reads run.completed events from the runner, saves the result and announces the update on Redis
public class RunResultConsumer(
    IConnection connection,
    IServiceScopeFactory scopes,
    IConnectionMultiplexer redis,
    ILogger<RunResultConsumer> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);
        await RunQueue.DeclareQueuesAsync(channel, stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, message) =>
        {
            try
            {
                await SaveResultAsync(message.Body);
            }
            catch (Exception error)
            {
                logger.LogError(error, "Could not save run result");
            }
            await channel.BasicAckAsync(message.DeliveryTag, multiple: false);
        };

        await channel.BasicConsumeAsync(RunQueue.Completed, autoAck: false, consumer, stoppingToken);
        logger.LogInformation("Listening for results on {Queue}", RunQueue.Completed);
    }

    private async Task SaveResultAsync(ReadOnlyMemory<byte> body)
    {
        var result = JsonSerializer.Deserialize<RunResult>(body.Span, JsonSerializerOptions.Web)
            ?? throw new InvalidOperationException("Empty run result");

        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ExecutionDb>();
        var run = await db.Runs.FindAsync(result.RunId);
        if (run is null)
        {
            logger.LogWarning("Result for unknown run {RunId}", result.RunId);
            return;
        }

        run.Status = result.Status;
        run.ExitCode = result.ExitCode;
        run.Stdout = result.Stdout;
        run.Stderr = result.Stderr;
        run.Truncated = result.Truncated;
        run.TimeMs = result.TimeMs;
        run.FinishedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await redis.GetSubscriber().PublishAsync(RedisChannel.Literal($"run:{run.Id}"), run.Status);
        logger.LogInformation("Run {RunId} finished: {Status}", run.Id, run.Status);
    }

    private record RunResult(
        Guid RunId,
        string Status,
        int? ExitCode,
        string Stdout,
        string Stderr,
        bool Truncated,
        int TimeMs);
}
