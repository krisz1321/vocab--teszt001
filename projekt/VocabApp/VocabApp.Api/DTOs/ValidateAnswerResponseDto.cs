using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class ValidateAnswerResponseDto
{
    public bool IsCorrect { get; set; }

    // Magyar → angol irányban: a válasz a kártya szava helyett egy azonos jelentésű másik angol szó.
    public bool IsSynonym { get; set; }

    [MaxLength(500)]
    public string Feedback { get; set; } = string.Empty;

    [MaxLength(500)]
    public string EnglishAnswer { get; set; } = string.Empty;
}
