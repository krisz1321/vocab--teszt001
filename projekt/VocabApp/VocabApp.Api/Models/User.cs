using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Services;

namespace VocabApp.Api.Models;

public sealed class User
{
    public int Id { get; set; }

    [Required, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(Usernames.MaxLength)]
    public string Username { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [MaxLength(80)]
    public string? DisplayName { get; set; }

    public int DailyNewCardGoal { get; set; } = 20;

    public int MinimumAnswerSeconds { get; set; }

    public bool AutomaticAiCheck { get; set; } = true;

    public bool AcceptHungarianParaphrase { get; set; }

    public bool AcceptPartialMeaningMatch { get; set; } = true;

    public bool RequireAppealReason { get; set; } = true;

    public bool ReuseSavedExamples { get; set; } = true;

    [Required, MaxLength(16)]
    public string SavedLevelPolicy { get; set; } = SavedLevelPolicies.Exact;

    public bool GenerateAlternateDefinitions { get; set; } = true;

    public int LeechThreshold { get; set; } = CardLeech.DefaultThreshold;

    [Required, MaxLength(2)]
    public string ExampleLevel { get; set; } = ExampleLevels.Default;

    [Required, MaxLength(64)]
    public string AiModel { get; set; } = AiModels.Default;

    [Required, MaxLength(128)]
    public string TimeZoneId { get; set; } = StudyClock.DefaultTimeZoneId;

    public int AiFillBatchSize { get; set; } = AiFillLimits.DefaultBatchSize;

    public int StudyDayStreak { get; set; }

    public int LongestStudyDayStreak { get; set; }

    public int AiCallCount { get; set; }

    public DateTime? LastStudyDate { get; set; }

    public ICollection<Deck> Decks { get; set; } = new List<Deck>();

    public ICollection<UserStudyDay> StudyDays { get; set; } = new List<UserStudyDay>();

    public ICollection<UserAiFillDay> AiFillDays { get; set; } = new List<UserAiFillDay>();
}
