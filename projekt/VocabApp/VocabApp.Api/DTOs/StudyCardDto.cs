namespace VocabApp.Api.DTOs;

public sealed class StudyCardDto
{
    public int Id { get; set; }
    public string Term { get; set; } = string.Empty;
    public string Definition { get; set; } = string.Empty;
    public string? Example { get; set; }
    public DateTime NextReviewDate { get; set; }
    public float EaseFactor { get; set; }
    public int Interval { get; set; }
    public int Streak { get; set; }
    public int IncorrectCount { get; set; }
}
