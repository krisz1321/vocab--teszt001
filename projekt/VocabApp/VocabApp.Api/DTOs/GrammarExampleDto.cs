using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GrammarExampleRequestDto
{
    [Range(1, int.MaxValue)]
    public int CardId { get; set; }

    [Required, MaxLength(32)]
    public string Tense { get; set; } = string.Empty;
}

public sealed class GrammarExampleResponseDto
{
    [MaxLength(500)]
    public string Example { get; set; } = string.Empty;
}
