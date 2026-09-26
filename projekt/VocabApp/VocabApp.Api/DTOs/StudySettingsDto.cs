using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class StudySettingsDto
{
    [Range(0, 100)]
    public int DailyNewCardGoal { get; set; }

    [Range(0, 120)]
    public int MinimumAnswerSeconds { get; set; }
}
