namespace VocabApp.Api.DTOs;

public sealed class CardProgressDto
{
    public int CardId { get; set; }
    public DateTime NextReviewDate { get; set; }
    public float EaseFactor { get; set; }
    public int Interval { get; set; }
    public int Streak { get; set; }
    public int IncorrectCount { get; set; }
}
