namespace VocabApp.Api.Models;

public sealed class UserStudyDay
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public DateTime DayUtc { get; set; }
    public int SecondsStudied { get; set; }
    public int AnswerCount { get; set; }
    public int CorrectCount { get; set; }
    public int IncorrectCount { get; set; }
    public User User { get; set; } = null!;
}
