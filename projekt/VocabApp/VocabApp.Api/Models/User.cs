using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class User
{
    public int Id { get; set; }

    [Required, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [MaxLength(80)]
    public string? DisplayName { get; set; }

    public int DailyNewCardGoal { get; set; } = 20;

    public int MinimumAnswerSeconds { get; set; }

    public bool AutomaticAiCheck { get; set; }

    public bool AcceptHungarianParaphrase { get; set; }

    public bool RequireAppealReason { get; set; } = true;

    public bool ReuseSavedExamples { get; set; } = true;

    [Required, MaxLength(16)]
    public string SavedLevelPolicy { get; set; } = SavedLevelPolicies.Exact;

    public bool GenerateAlternateDefinitions { get; set; } = true;

    [Required, MaxLength(2)]
    public string ExampleLevel { get; set; } = ExampleLevels.Default;

    [Required, MaxLength(64)]
    public string AiModel { get; set; } = AiModels.Default;

    public int StudyDayStreak { get; set; }

    public int LongestStudyDayStreak { get; set; }

    public int AiCallCount { get; set; }

    public DateTime? LastStudyDate { get; set; }

    public ICollection<Deck> Decks { get; set; } = new List<Deck>();

    public ICollection<UserStudyDay> StudyDays { get; set; } = new List<UserStudyDay>();
}
