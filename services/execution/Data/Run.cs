namespace Execution.Data;

public class Run
{
    public Guid Id { get; set; }
    public string Language { get; set; } = "";
    public string Code { get; set; } = "";
    public string Stdin { get; set; } = "";
    public string? UserId { get; set; }

    // queued | completed | timed_out | memory_exceeded | failed
    public string Status { get; set; } = Queued;
    public int? ExitCode { get; set; }
    public string Stdout { get; set; } = "";
    public string Stderr { get; set; } = "";
    public bool Truncated { get; set; }
    public int TimeMs { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime? FinishedAt { get; set; }

    public const string Queued = "queued";

    public bool IsFinished => Status != Queued;
}
