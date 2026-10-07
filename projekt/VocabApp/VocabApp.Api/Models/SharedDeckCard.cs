using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class SharedDeckCard
{
    public int Id { get; set; }

    public int SharedDeckId { get; set; }

    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Example { get; set; }

    [MaxLength(200)]
    public string? TargetMeanings { get; set; }

    [MaxLength(CardTags.MaxStoredLength)]
    public string? Tags { get; set; }

    public SharedDeck SharedDeck { get; set; } = null!;
}
