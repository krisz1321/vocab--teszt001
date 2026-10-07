using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class Card
{
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Example { get; set; }

    [MaxLength(300)]
    public string? TargetMeanings { get; set; }

    [MaxLength(CardTags.MaxStoredLength)]
    public string? Tags { get; set; }

    public int DeckId { get; set; }

    public Deck Deck { get; set; } = null!;

    public CardProgress? Progress { get; set; }
}
