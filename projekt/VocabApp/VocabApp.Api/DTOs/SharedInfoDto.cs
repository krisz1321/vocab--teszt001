namespace VocabApp.Api.DTOs;

/// <summary>A pakli megosztásának állapota a tulajdonos nézetében.</summary>
public sealed class SharedInfoDto
{
    public int Version { get; set; }

    public DateTime SharedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public int SaveCount { get; set; }

    /// <summary>Hamis, ha a megosztást megszüntették (a verzió és a mentések száma ilyenkor is megmarad).</summary>
    public bool IsActive { get; set; }

    /// <summary>Igaz, ha a pakli a legutóbbi közzététel óta módosult.</summary>
    public bool HasUnpublishedChanges { get; set; }
}
