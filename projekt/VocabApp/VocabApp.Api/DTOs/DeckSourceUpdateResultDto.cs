namespace VocabApp.Api.DTOs;

public sealed class DeckSourceUpdateResultDto
{
    public DeckDto Deck { get; set; } = null!;

    public int AddedCount { get; set; }

    public int UpdatedCount { get; set; }

    public int LocalOnlyCount { get; set; }
}
