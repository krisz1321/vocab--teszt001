namespace VocabApp.Api.DTOs;

public sealed class DeckDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public int CardCount { get; set; }

    public int LearnedCount { get; set; }

    public int DueCount { get; set; }

    public bool IsPublic { get; set; }

    public string? ExampleLevel { get; set; }
}
