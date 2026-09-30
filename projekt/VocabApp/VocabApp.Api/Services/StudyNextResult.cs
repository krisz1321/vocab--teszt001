using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public sealed class StudyNextResult
{
    public StudyNextDto? Value { get; private init; }

    public int? ErrorStatus { get; private init; }

    public string? ErrorTitle { get; private init; }

    public static StudyNextResult Success(StudyNextDto value) => new() { Value = value };

    public static StudyNextResult Fail(int status, string title) => new() { ErrorStatus = status, ErrorTitle = title };
}
