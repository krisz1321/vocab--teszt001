using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class AppealAnswerResponseDto
{
    public bool Accepted { get; set; }

    [MaxLength(500)]
    public string Feedback { get; set; } = string.Empty;
}
