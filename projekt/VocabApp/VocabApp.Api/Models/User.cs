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

    public bool ReuseSavedExamples { get; set; } = true;

    public int StudyDayStreak { get; set; }

    public int LongestStudyDayStreak { get; set; }

    public DateTime? LastStudyDate { get; set; }

    public ICollection<Deck> Decks { get; set; } = new List<Deck>();

    public ICollection<UserStudyDay> StudyDays { get; set; } = new List<UserStudyDay>();
}
