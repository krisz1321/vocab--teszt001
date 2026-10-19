using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public sealed class StudySubmitResult
{
    public CardProgressDto? Progress { get; private init; }

    public int? ErrorStatus { get; private init; }

    public string? ErrorTitle { get; private init; }

    // Gépi hibakód a kliensnek ("answer-too-early" | "answer-token-invalid"), hogy a két 400-at szétválaszthassa.
    public string? ErrorCode { get; private init; }

    public static StudySubmitResult Success(CardProgressDto progress) => new() { Progress = progress };

    public static StudySubmitResult Fail(int status, string title, string? code = null) =>
        new() { ErrorStatus = status, ErrorTitle = title, ErrorCode = code };
}
