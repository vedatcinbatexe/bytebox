using System.Text;
using Bytebox.Execution.Grpc;
using Execution.Data;
using Execution.Messaging;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using Run = Execution.Data.Run;
using RunMessage = Bytebox.Execution.Grpc.Run;

namespace Execution.Grpc;

public class ExecutionGrpcService(ExecutionDb db, RunQueue queue, IConnectionMultiplexer redis)
    : ExecutionService.ExecutionServiceBase
{
    private static readonly string[] Languages = ["python", "javascript", "cpp"];
    private const int MaxCodeBytes = 64 * 1024;

    public override async Task<CreateRunResponse> CreateRun(CreateRunRequest request, ServerCallContext context)
    {
        if (!Languages.Contains(request.Language))
            throw new RpcException(new Status(StatusCode.InvalidArgument, $"Unsupported language: {request.Language}"));
        if (Encoding.UTF8.GetByteCount(request.Code) > MaxCodeBytes)
            throw new RpcException(new Status(StatusCode.InvalidArgument, "Code is larger than 64 KB"));

        var run = new Run
        {
            Id = Guid.NewGuid(),
            Language = request.Language,
            Code = request.Code,
            Stdin = request.Stdin,
            UserId = string.IsNullOrEmpty(request.UserId) ? null : request.UserId,
            CreatedAt = DateTime.UtcNow,
        };
        db.Runs.Add(run);
        await db.SaveChangesAsync(context.CancellationToken);
        await queue.PublishRunRequestedAsync(run, context.CancellationToken);

        return new CreateRunResponse { RunId = run.Id.ToString() };
    }

    public override async Task<RunMessage> GetRun(GetRunRequest request, ServerCallContext context)
    {
        var run = await FindRunAsync(ParseId(request.RunId), context.CancellationToken);
        return ToMessage(run);
    }

    public override async Task StreamRun(
        GetRunRequest request,
        IServerStreamWriter<RunMessage> stream,
        ServerCallContext context)
    {
        var id = ParseId(request.RunId);
        var cancellationToken = context.CancellationToken;

        // Subscribe before reading the run, so an update can't slip in between
        var updates = await redis.GetSubscriber().SubscribeAsync(RedisChannel.Literal($"run:{id}"));
        try
        {
            var run = await FindRunAsync(id, cancellationToken);
            await stream.WriteAsync(ToMessage(run), cancellationToken);

            while (!run.IsFinished)
            {
                await updates.ReadAsync(cancellationToken);
                run = await FindRunAsync(id, cancellationToken);
                await stream.WriteAsync(ToMessage(run), cancellationToken);
            }
        }
        finally
        {
            await updates.UnsubscribeAsync();
        }
    }

    private async Task<Run> FindRunAsync(Guid id, CancellationToken cancellationToken)
    {
        return await db.Runs.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new RpcException(new Status(StatusCode.NotFound, $"Run {id} not found"));
    }

    private static Guid ParseId(string runId)
    {
        return Guid.TryParse(runId, out var id)
            ? id
            : throw new RpcException(new Status(StatusCode.InvalidArgument, "Invalid run id"));
    }

    private static RunMessage ToMessage(Run run)
    {
        var message = new RunMessage
        {
            Id = run.Id.ToString(),
            Language = run.Language,
            Status = run.Status,
            Stdout = run.Stdout,
            Stderr = run.Stderr,
            Truncated = run.Truncated,
            TimeMs = run.TimeMs,
            CreatedAt = run.CreatedAt.ToString("O"),
            FinishedAt = run.FinishedAt?.ToString("O") ?? "",
        };
        if (run.ExitCode is int exitCode)
            message.ExitCode = exitCode;
        return message;
    }
}
