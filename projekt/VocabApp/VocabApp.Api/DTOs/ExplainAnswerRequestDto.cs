using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class ExplainAnswerRequestDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Answer { get; set; } = string.Empty;

    public List<ExplainMessageDto>? Messages { get; set; }
}
