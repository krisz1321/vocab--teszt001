using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class ValidateAnswerResponseDto
{
    public bool IsCorrect { get; set; }

    [MaxLength(500)]
    public string Feedback { get; set; } = string.Empty;
}
