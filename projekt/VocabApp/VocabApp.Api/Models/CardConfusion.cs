namespace VocabApp.Api.Models;

public sealed class CardConfusion
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int CardId { get; set; }

    public int ConfusedWithCardId { get; set; }

    public int Count { get; set; } = 1;

    public DateTime LastConfusedAt { get; set; }

    public User User { get; set; } = null!;

    public Card Card { get; set; } = null!;

    public Card ConfusedWithCard { get; set; } = null!;
}
