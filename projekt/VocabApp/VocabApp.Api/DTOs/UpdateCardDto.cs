namespace VocabApp.Api.DTOs;

public sealed class UpdateCardDto
{
    public string? Term { get; set; }

    public string? Definition { get; set; }

    public string? Example { get; set; }

    public string? TargetMeanings { get; set; }

    public string? Tags { get; set; }
}
