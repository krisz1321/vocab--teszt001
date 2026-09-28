using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public sealed class StudySettingsResult
{
    public StudySettingsDto? Value { get; private init; }

    public int? ErrorStatus { get; private init; }

    public string? ErrorTitle { get; private init; }

    public static StudySettingsResult Success(StudySettingsDto value) => new() { Value = value };

    public static StudySettingsResult Fail(int status, string title) => new() { ErrorStatus = status, ErrorTitle = title };
}
