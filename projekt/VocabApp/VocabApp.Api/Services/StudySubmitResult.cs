using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public sealed class StudySubmitResult
{
    public CardProgressDto? Progress { get; private init; }

    public int? ErrorStatus { get; private init; }

    public string? ErrorTitle { get; private init; }

    public static StudySubmitResult Success(CardProgressDto progress) => new() { Progress = progress };

    public static StudySubmitResult Fail(int status, string title) => new() { ErrorStatus = status, ErrorTitle = title };
}
