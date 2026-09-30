using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class ExplainMessageDto
{
    [Required, MaxLength(16)]
    public string Role { get; set; } = string.Empty;

    [Required, MaxLength(2000)]
    public string Content { get; set; } = string.Empty;
}
