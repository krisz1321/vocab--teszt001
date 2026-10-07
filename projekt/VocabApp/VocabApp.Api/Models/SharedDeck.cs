using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

/// <summary>
/// Egy pakli közzétett pillanatképe. A tulajdonos paklijának szerkesztése nem változtatja meg,
/// csak a megosztás frissítése írja felül, és növeli a verziószámot.
/// </summary>
public sealed class SharedDeck
{
    public int Id { get; set; }

    public int OwnerId { get; set; }

    public int SourceDeckId { get; set; }

    [Required, MaxLength(DeckLimits.MaxNameLength)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(DeckLimits.MaxDescriptionLength)]
    public string? Description { get; set; }

    [MaxLength(2)]
    public string? ExampleLevel { get; set; }

    public int Version { get; set; } = 1;

    /// <summary>Az első közzététel ideje (UTC).</summary>
    public DateTime SharedAt { get; set; }

    /// <summary>Az utolsó közzététel ideje (UTC).</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>A megosztás megszüntetése után hamis: a verzió és a mentések száma megmarad.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>A közzétett tartalom lenyomata, amivel kiderül, hogy a pakli azóta módosult-e.</summary>
    [MaxLength(64)]
    public string ContentHash { get; set; } = string.Empty;

    public User Owner { get; set; } = null!;

    public Deck SourceDeck { get; set; } = null!;

    public ICollection<SharedDeckCard> Cards { get; set; } = new List<SharedDeckCard>();

    public ICollection<SharedDeckSave> Saves { get; set; } = new List<SharedDeckSave>();
}
