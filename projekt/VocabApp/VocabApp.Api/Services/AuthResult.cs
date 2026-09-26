using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public sealed class AuthResult
{
    public AuthResponseDto? Response { get; private init; }

    public int? ErrorStatus { get; private init; }

    public string? ErrorTitle { get; private init; }

    public static AuthResult Success(AuthResponseDto response) => new() { Response = response };

    public static AuthResult Fail(int status, string title) => new() { ErrorStatus = status, ErrorTitle = title };
}
