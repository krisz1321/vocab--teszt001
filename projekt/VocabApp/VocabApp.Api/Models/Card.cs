using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class Card
{
    public int Id { get; set; }

    [Required, MaxLength(CardLimits.MaxTermLength)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(CardLimits.MaxDefinitionLength)]
    public string Definition { get; set; } = string.Empty;

    [MaxLength(CardLimits.MaxExampleLength)]
    public string? Example { get; set; }

    [MaxLength(CardLimits.MaxTargetMeaningsLength)]
    public string? TargetMeanings { get; set; }

    [MaxLength(CardTags.MaxStoredLength)]
    public string? Tags { get; set; }

    public int DeckId { get; set; }

    public Deck Deck { get; set; } = null!;

    public CardProgress? Progress { get; set; }
}
