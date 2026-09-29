namespace VocabApp.Api.DTOs;

public sealed class LearnedCardDto
{
    public int Id { get; set; }

    public string Term { get; set; } = string.Empty;

    public string Definition { get; set; } = string.Empty;

    public string? TargetMeanings { get; set; }

    public string DeckName { get; set; } = string.Empty;

    public DateTime LearnedAt { get; set; }

    public DateTime? LastReviewedAt { get; set; }
}
