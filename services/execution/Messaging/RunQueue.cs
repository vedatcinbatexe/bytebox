using System.Text.Json;
using Execution.Data;
using RabbitMQ.Client;

namespace Execution.Messaging;

// Publishes run.requested events for the runner
public class RunQueue(IConnection connection)
{
    public const string Requested = "run.requested";
    public const string Completed = "run.completed";
    public const string Output = "run.output"; // live output while a program runs

    // A RabbitMQ channel must not be used by two publishers at the same time
    private readonly SemaphoreSlim _lock = new(1, 1);
    private IChannel? _channel;

    public async Task PublishRunRequestedAsync(Run run, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            runId = run.Id,
            language = run.Language,
            entryFile = run.EntryFile,
            files = run.Files.Select(file => new { path = file.Path, content = file.Content }),
            stdin = run.Stdin,
            args = run.Args,
        });
        var properties = new BasicProperties { Persistent = true, ContentType = "application/json" };

        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_channel is null)
            {
                _channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);
                await DeclareQueuesAsync(_channel, cancellationToken);
            }
            await _channel.BasicPublishAsync("", Requested, false, properties, body, cancellationToken);
        }
        finally
        {
            _lock.Release();
        }
    }

    // Must match how the runner declares the queues
    public static async Task DeclareQueuesAsync(IChannel channel, CancellationToken cancellationToken)
    {
        await channel.QueueDeclareAsync(Requested, durable: true, exclusive: false, autoDelete: false, cancellationToken: cancellationToken);
        await channel.QueueDeclareAsync(Completed, durable: true, exclusive: false, autoDelete: false, cancellationToken: cancellationToken);
        await channel.QueueDeclareAsync(Output, durable: true, exclusive: false, autoDelete: false, cancellationToken: cancellationToken);
    }
}
