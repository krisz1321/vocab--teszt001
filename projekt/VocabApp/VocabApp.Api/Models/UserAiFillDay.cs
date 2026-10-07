namespace VocabApp.Api.Models;

public sealed class UserAiFillDay
{
    public int Id { get; set; }
    public int UserId { get; set; }

    /// <summary>A felhasználó időzónája szerinti naptári nap (éjfél), mint a <see cref="UserStudyDay.DayUtc"/>-nál.</summary>
    public DateTime Day { get; set; }

    public int Count { get; set; }
    public User User { get; set; } = null!;
}
