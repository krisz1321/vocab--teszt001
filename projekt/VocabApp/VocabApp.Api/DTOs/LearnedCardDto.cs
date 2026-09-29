namespace VocabApp.Api.DTOs;

public sealed class LearnedCardDto
{
    public int Id { get; set; }

    public string Term { get; set; } = string.Empty;

    public string Definition { get; set; } = string.Empty;

    public string? Example { get; set; }

    public string? TargetMeanings { get; set; }

    public string DeckName { get; set; } = string.Empty;

    public DateTime LearnedAt { get; set; }

    public DateTime? FirstReviewedAt { get; set; }

    public DateTime? LastReviewedAt { get; set; }

    public DateTime NextReviewDate { get; set; }

    public int Streak { get; set; }

    public int Interval { get; set; }

    public float EaseFactor { get; set; }

    public int CorrectCount { get; set; }

    public int IncorrectCount { get; set; }

    public bool MarkedKnown { get; set; }
}
