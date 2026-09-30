using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class StudySettingsDto
{
    [Range(0, 100)]
    public int DailyNewCardGoal { get; set; }

    [Range(0, 120)]
    public int MinimumAnswerSeconds { get; set; }

    public bool AutomaticAiCheck { get; set; }

    public bool AcceptHungarianParaphrase { get; set; }

    public bool RequireAppealReason { get; set; } = true;

    public bool ReuseSavedExamples { get; set; }

    [Required, MaxLength(16)]
    public string SavedLevelPolicy { get; set; } = SavedLevelPolicies.Exact;

    public bool GenerateAlternateDefinitions { get; set; }

    [Required, MaxLength(2)]
    public string ExampleLevel { get; set; } = string.Empty;

    [Required, MaxLength(64)]
    public string AiModel { get; set; } = string.Empty;
}
