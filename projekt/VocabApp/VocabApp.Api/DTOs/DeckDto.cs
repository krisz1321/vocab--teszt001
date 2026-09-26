namespace VocabApp.Api.DTOs;

public sealed class DeckDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public bool IsPublic { get; set; }
}
