using System.Text;
using System.Text.RegularExpressions;
using Bytebox.Execution.Grpc;

namespace Execution.Grpc;

// Same limits as the runner (services/runner/sandbox.py)
public static partial class ProjectRules
{
    public const int MaxFiles = 50;
    public const int MaxProjectBytes = 256 * 1024;

    private static readonly Dictionary<string, string> LanguagesByExtension = new()
    {
        [".py"] = "python",
        [".js"] = "javascript",
        [".ts"] = "typescript",
        [".java"] = "java",
        [".cpp"] = "cpp",
    };

    [GeneratedRegex(@"^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$")]
    private static partial Regex SafePath();

    public static string? LanguageFor(string path)
    {
        return LanguagesByExtension.GetValueOrDefault(Path.GetExtension(path));
    }

    // Returns an error message, or null if the request is valid
    public static string? Validate(CreateRunRequest request)
    {
        if (request.Files.Count == 0)
            return "The project has no files";
        if (request.Files.Count > MaxFiles)
            return $"A project can have at most {MaxFiles} files";
        if (request.Files.Sum(file => Encoding.UTF8.GetByteCount(file.Content)) > MaxProjectBytes)
            return "The project is larger than 256 KB";

        foreach (var file in request.Files)
        {
            if (file.Path.Length > 200 || !SafePath().IsMatch(file.Path) || file.Path.Split('/').Contains(".."))
                return $"Invalid file path: {file.Path}";
        }

        if (request.Files.All(file => file.Path != request.EntryFile))
            return $"Entry file not found: {request.EntryFile}";
        if (LanguageFor(request.EntryFile) is null)
            return "Only .py, .js, .ts, .java and .cpp files can be run";
        return null;
    }
}
