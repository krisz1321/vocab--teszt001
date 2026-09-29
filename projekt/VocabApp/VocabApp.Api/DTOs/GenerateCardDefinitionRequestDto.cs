using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateCardDefinitionRequestDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int DeckId { get; set; }
}
