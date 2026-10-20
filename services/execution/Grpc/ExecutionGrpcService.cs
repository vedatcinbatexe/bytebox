using Bytebox.Execution.Grpc;
using Execution.Data;
using Execution.Messaging;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using Run = Execution.Data.Run;
using RunMessage = Bytebox.Execution.Grpc.Run;

namespace Execution.Grpc;

public class ExecutionGrpcService(ExecutionDb db, RunQueue queue, IConnectionMultiplexer redis, IConfiguration config)
    : ExecutionService.ExecutionServiceBase
{
    // Fair use: only recent queued runs count, so a run lost by a crashed runner can't block anyone for long
    private static readonly TimeSpan RecentRuns = TimeSpan.FromMinutes(2);
    private int MaxRunsPerUser => config.GetValue("Limits:RunsInProgressPerUser", 2);
    private int MaxQueuedRuns => config.GetValue("Limits:QueuedRuns", 50);

    public override async Task<CreateRunResponse> CreateRun(CreateRunRequest request, ServerCallContext context)
    {
        if (ProjectRules.Validate(request) is string error)
            throw new RpcException(new Status(StatusCode.InvalidArgument, error));
        await CheckFairUseAsync(request.UserId, context.CancellationToken);

        var run = new Run
        {
            Id = Guid.NewGuid(),
            Language = ProjectRules.LanguageFor(request.EntryFile)!,
            EntryFile = request.EntryFile,
            Files = request.Files.Select(file => new Data.ProjectFile { Path = file.Path, Content = file.Content }).ToList(),
            Stdin = request.Stdin,
            UserId = string.IsNullOrEmpty(request.UserId) ? null : request.UserId,
            CreatedAt = DateTime.UtcNow,
        };
        db.Runs.Add(run);
        await db.SaveChangesAsync(context.CancellationToken);
        await queue.PublishRunRequestedAsync(run, context.CancellationToken);

        return new CreateRunResponse { RunId = run.Id.ToString() };
    }

    private async Task CheckFairUseAsync(string userId, CancellationToken cancellationToken)
    {
        var since = DateTime.UtcNow - RecentRuns;
        var queued = db.Runs.Where(r => r.Status == Run.Queued && r.CreatedAt > since);

        if (!string.IsNullOrEmpty(userId) &&
            await queued.CountAsync(r => r.UserId == userId, cancellationToken) >= MaxRunsPerUser)
        {
            throw new RpcException(new Status(StatusCode.ResourceExhausted,
                $"You already have {MaxRunsPerUser} runs in progress. Wait for one to finish."));
        }
        if (await queued.CountAsync(cancellationToken) >= MaxQueuedRuns)
        {
            throw new RpcException(new Status(StatusCode.Unavailable,
                "Bytebox is busy right now. Please try again in a moment."));
        }
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
            await stream.WriteAsync(await WithLiveOutputAsync(run), cancellationToken);

            while (!run.IsFinished)
            {
                await updates.ReadAsync(cancellationToken);
                run = await FindRunAsync(id, cancellationToken);
                await stream.WriteAsync(await WithLiveOutputAsync(run), cancellationToken);
            }
        }
        finally
        {
            await updates.UnsubscribeAsync();
        }
    }

    public override async Task<ListRunsResponse> ListRuns(ListRunsRequest request, ServerCallContext context)
    {
        if (string.IsNullOrEmpty(request.UserId))
            throw new RpcException(new Status(StatusCode.InvalidArgument, "user_id is required"));
        var limit = request.Limit is > 0 and <= 100 ? request.Limit : 20;

        var runs = await db.Runs.AsNoTracking()
            .Where(r => r.UserId == request.UserId)
            .OrderByDescending(r => r.CreatedAt)
            .Take(limit)
            .ToListAsync(context.CancellationToken);

        var response = new ListRunsResponse();
        response.Runs.AddRange(runs.Select(ToMessage));
        return response;
    }

    // While a run is going, show the output it has printed so far as status "running"
    private async Task<RunMessage> WithLiveOutputAsync(Run run)
    {
        var message = ToMessage(run);
        if (run.IsFinished) return message;

        var live = await LiveOutput.LoadAsync(redis.GetDatabase(), run.Id);
        if (live is not null)
        {
            message.Status = "running";
            message.Stdout = live.Stdout;
            message.Stderr = live.Stderr;
        }
        return message;
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
            EntryFile = run.EntryFile,
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
