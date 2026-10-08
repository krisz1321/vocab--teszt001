namespace VocabApp.Api.DTOs;

public sealed class StudyNextDto
{
    public StudyCardDto? Card { get; set; }
    public string? AnswerToken { get; set; }
    public int NewCardsIntroducedToday { get; set; }
    public int DailyNewCardGoal { get; set; }
    public int AvailableCards { get; set; }
    public int MinimumAnswerSeconds { get; set; }
    public bool AutomaticAiCheck { get; set; }
    public bool AcceptHungarianParaphrase { get; set; }
    public bool AcceptPartialMeaningMatch { get; set; } = true;
    public bool AiCheckAvailable { get; set; } = true;
    public bool RequireAppealReason { get; set; } = true;
    public string Status { get; set; } = "empty";
}
