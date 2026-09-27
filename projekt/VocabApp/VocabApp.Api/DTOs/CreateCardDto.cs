namespace VocabApp.Api.DTOs;

public sealed class CreateCardDto
{
    public int DeckId { get; set; }

    public string? Term { get; set; }

    public string? Definition { get; set; }

    public string? Example { get; set; }

    public string? TargetMeanings { get; set; }
}
