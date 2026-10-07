namespace VocabApp.Api.Models;

public static class DeckLimits
{
    public const int MaxNameLength = 100;
    public const int MaxDescriptionLength = 500;

    /// <summary>Üres vagy csak szóközből álló leírásból null lesz.</summary>
    public static string? NormalizeDescription(string? description)
    {
        var trimmed = description?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
