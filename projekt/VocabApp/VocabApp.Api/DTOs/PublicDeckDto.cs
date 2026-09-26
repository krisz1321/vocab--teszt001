namespace VocabApp.Api.DTOs;

public sealed class PublicDeckDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public int CardCount { get; set; }

    public string OwnerEmail { get; set; } = string.Empty;
}
