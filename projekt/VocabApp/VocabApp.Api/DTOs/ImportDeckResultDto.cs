namespace VocabApp.Api.DTOs;

public sealed class ImportDeckResultDto
{
    public int ImportedCount { get; set; }

    public int SkippedCount { get; set; }

    public IReadOnlyList<string> SkippedRows { get; set; } = [];
}
