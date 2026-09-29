namespace VocabApp.Api.DTOs;

public sealed class CardDto
{
    public int Id { get; set; }

    public int DeckId { get; set; }

    public string Term { get; set; } = string.Empty;

    public string Definition { get; set; } = string.Empty;

    public string? Example { get; set; }

    public string? TargetMeanings { get; set; }

    public bool IsLearned { get; set; }

    public bool MarkedKnown { get; set; }
}
