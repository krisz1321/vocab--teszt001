namespace VocabApp.Api.DTOs;

public sealed class FreeStudyCardDto
{
    public int Id { get; set; }

    public string Term { get; set; } = string.Empty;

    public string? TargetMeanings { get; set; }

    public string Definition { get; set; } = string.Empty;

    public string? Example { get; set; }

    public bool? Knows { get; set; }
}
