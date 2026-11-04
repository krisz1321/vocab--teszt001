using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class SharedDeckCard
{
    public int Id { get; set; }

    public int SharedDeckId { get; set; }

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

    public SharedDeck SharedDeck { get; set; } = null!;
}
