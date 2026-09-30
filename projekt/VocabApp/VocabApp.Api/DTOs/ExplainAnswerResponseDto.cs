using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class ExplainAnswerResponseDto
{
    public bool OnTopic { get; set; }

    [MaxLength(1500)]
    public string Text { get; set; } = string.Empty;
}
