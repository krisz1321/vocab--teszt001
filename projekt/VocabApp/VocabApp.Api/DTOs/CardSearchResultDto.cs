namespace VocabApp.Api.DTOs;

public sealed class CardSearchResultDto
{
    public int Id { get; set; }

    public int DeckId { get; set; }

    public string DeckName { get; set; } = string.Empty;

    public string Term { get; set; } = string.Empty;

    public string Definition { get; set; } = string.Empty;

    public string? TargetMeanings { get; set; }

    public string? Tags { get; set; }

    public bool IsLearned { get; set; }

    public string Suspension { get; set; } = "none";

    public bool IsLeech { get; set; }
}
