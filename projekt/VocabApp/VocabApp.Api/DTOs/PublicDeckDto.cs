namespace VocabApp.Api.DTOs;

public sealed class PublicDeckDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public int CardCount { get; set; }

    public string OwnerUsername { get; set; } = string.Empty;

    public string? ExampleLevel { get; set; }

    public bool LevelIsAutomatic { get; set; }

    public int Version { get; set; }

    public DateTime SharedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    /// <summary>Hány különböző felhasználó mentette le a paklit.</summary>
    public int SaveCount { get; set; }

    /// <summary>Igaz, ha a kérő felhasználó már lementette a paklit.</summary>
    public bool AlreadySaved { get; set; }
}
