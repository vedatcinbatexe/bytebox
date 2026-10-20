using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using StackExchange.Redis;

namespace Execution.Messaging;

// Reads run.output events (output so far, while a program runs), stores them in Redis
// and wakes up open StreamRun calls
public class LiveOutputConsumer(IConnection connection, IConnectionMultiplexer redis, ILogger<LiveOutputConsumer> logger)
    : BackgroundService
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
                var update = JsonSerializer.Deserialize<OutputUpdate>(message.Body.Span, JsonSerializerOptions.Web);
                if (update is not null)
                {
                    await LiveOutput.SaveAsync(redis.GetDatabase(), update.RunId, new LiveOutput(update.Stdout, update.Stderr));
                    await redis.GetSubscriber().PublishAsync(RedisChannel.Literal($"run:{update.RunId}"), "output");
                }
            }
            catch (Exception error)
            {
                logger.LogError(error, "Could not handle live output");
            }
            await channel.BasicAckAsync(message.DeliveryTag, multiple: false);
        };

        await channel.BasicConsumeAsync(RunQueue.Output, autoAck: false, consumer, stoppingToken);
    }

    private record OutputUpdate(Guid RunId, string Stdout, string Stderr);
}
