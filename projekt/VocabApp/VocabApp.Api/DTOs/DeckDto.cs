namespace VocabApp.Api.DTOs;

public sealed class DeckDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public int CardCount { get; set; }

    public int LearnedCount { get; set; }

    public int DueCount { get; set; }

    /// <summary>Igaz, ha a pakli jelenleg meg van osztva.</summary>
    public bool IsPublic { get; set; }

    public string? ExampleLevel { get; set; }

    public SharedInfoDto? Share { get; set; }

    /// <summary>Ha a paklit megosztott pakliból mentették le, annak azonosítója (amíg a megosztás létezik).</summary>
    public int? SourceSharedDeckId { get; set; }

    /// <summary>Ha a paklit megosztott pakliból mentették le, a mentéskori verzió.</summary>
    public int? SourceVersion { get; set; }

    /// <summary>A forrás megosztott pakli aktuális verziója (ha még megosztott).</summary>
    public int? LatestSharedVersion { get; set; }

    public bool UpdateAvailable { get; set; }
}
