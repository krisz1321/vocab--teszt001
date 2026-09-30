using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class AppealAnswerRequestDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Answer { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;
}
