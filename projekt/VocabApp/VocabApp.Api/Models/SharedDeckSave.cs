namespace VocabApp.Api.Models;

/// <summary>
/// Jelzi, hogy egy felhasználó lementette a megosztott paklit. Felhasználónként egy sor van,
/// és a mentett másolat törlése után is megmarad, így a mentések száma nem csökken.
/// </summary>
public sealed class SharedDeckSave
{
    public int Id { get; set; }

    public int SharedDeckId { get; set; }

    public int UserId { get; set; }

    public DateTime FirstSavedAt { get; set; }

    public DateTime LastSavedAt { get; set; }

    public SharedDeck SharedDeck { get; set; } = null!;

    public User User { get; set; } = null!;
}
