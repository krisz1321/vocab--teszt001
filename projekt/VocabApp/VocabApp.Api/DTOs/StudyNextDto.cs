namespace VocabApp.Api.DTOs;

public sealed class StudyNextDto
{
    public StudyCardDto? Card { get; set; }
    public string? AnswerToken { get; set; }
    public int NewCardsIntroducedToday { get; set; }
    public int DailyNewCardGoal { get; set; }
    public int MinimumAnswerSeconds { get; set; }
    public string Status { get; set; } = "empty";
}
