namespace VocabApp.Api.Services;

public sealed class StatusResult
{
    public int Status { get; private init; }

    public string? ErrorTitle { get; private init; }

    public bool IsSuccess => ErrorTitle is null;

    public static StatusResult Success(int status = StatusCodes.Status204NoContent) => new() { Status = status };

    public static StatusResult Fail(int status, string title) => new() { Status = status, ErrorTitle = title };
}
