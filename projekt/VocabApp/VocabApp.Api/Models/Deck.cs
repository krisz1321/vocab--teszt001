using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class Deck
{
    public int Id { get; set; }

    public int UserId { get; set; }

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(DeckLimits.MaxDescriptionLength)]
    public string? Description { get; set; }

    [MaxLength(2)]
    public string? ExampleLevel { get; set; }

    /// <summary>Ha a paklit egy megosztott pakliból mentették le, annak azonosítója.</summary>
    public int? SourceSharedDeckId { get; set; }

    /// <summary>A megosztott pakli mentéskori verziója.</summary>
    public int? SourceVersion { get; set; }

    public User User { get; set; } = null!;

    /// <summary>A pakli saját megosztása (ha van).</summary>
    public SharedDeck? SharedDeck { get; set; }

    public SharedDeck? SourceSharedDeck { get; set; }

    public ICollection<Card> Cards { get; set; } = new List<Card>();
}
