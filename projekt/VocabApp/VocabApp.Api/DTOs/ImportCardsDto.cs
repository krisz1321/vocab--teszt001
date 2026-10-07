namespace VocabApp.Api.DTOs;

public sealed class ImportCardsDto
{
    public List<ImportCardRowDto> Cards { get; set; } = [];
}

public sealed class ImportCardRowDto
{
    public string? Term { get; set; }

    public string? Definition { get; set; }

    public string? Example { get; set; }

    public string? TargetMeanings { get; set; }

    public string? Tags { get; set; }
}
