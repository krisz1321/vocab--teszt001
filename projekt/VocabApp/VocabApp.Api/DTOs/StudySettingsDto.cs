using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class StudySettingsDto
{
    [Range(0, 100)]
    public int DailyNewCardGoal { get; set; }

    [Range(0, 120)]
    public int MinimumAnswerSeconds { get; set; }

    public bool AutomaticAiCheck { get; set; }

    public bool AcceptHungarianParaphrase { get; set; }

    public bool ReuseSavedExamples { get; set; }

    public bool GenerateAlternateDefinitions { get; set; }

    [Required, MaxLength(2)]
    public string ExampleLevel { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string AiModel { get; set; } = string.Empty;
}
