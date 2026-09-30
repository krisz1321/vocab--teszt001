namespace VocabApp.Api.Models;

public sealed class FreeStudyMark
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int CardId { get; set; }

    public bool Knows { get; set; }

    public User User { get; set; } = null!;

    public Card Card { get; set; } = null!;
}
