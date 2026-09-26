namespace VocabApp.Api.Models;

public sealed class CardProgress
{
    public int Id { get; set; }
    public int CardId { get; set; }
    public DateTime NextReviewDate { get; set; } = DateTime.UtcNow;
    public float EaseFactor { get; set; } = 2.5f;
    public int Interval { get; set; }
    public int Streak { get; set; }
    public int IncorrectCount { get; set; }
    public int CorrectCount { get; set; }
    public DateTime? FirstReviewedAt { get; set; }
    public DateTime? LearnedAt { get; set; }
    public Card Card { get; set; } = null!;
}
