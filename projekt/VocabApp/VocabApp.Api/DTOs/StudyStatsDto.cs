namespace VocabApp.Api.DTOs;

public sealed class StudyStatsDto
{
    public int TotalCards { get; set; }
    public int DueCards { get; set; }
    public int TotalIncorrect { get; set; }
    public int LearnedCards { get; set; }
    public int StudyDayStreak { get; set; }
    public int LongestStudyDayStreak { get; set; }
    public int TotalStudySeconds { get; set; }
    public int TodayStudySeconds { get; set; }
    public List<StudyStatsDayDto> Days { get; set; } = [];
    public List<StudyStatsWeekDto> Weeks { get; set; } = [];
    public List<StudyStatsCardDto> Cards { get; set; } = [];
}

public sealed class StudyStatsDayDto
{
    public DateTime Date { get; set; }
    public int NewLearned { get; set; }
    public int CumulativeLearned { get; set; }
}

public sealed class StudyStatsWeekDto
{
    public DateTime WeekStart { get; set; }
    public int NewLearned { get; set; }
}

public sealed class StudyStatsCardDto
{
    public string Term { get; set; } = string.Empty;
    public int IncorrectCount { get; set; }
    public int Streak { get; set; }
    public int Interval { get; set; }
    public int CorrectCount { get; set; }
    public double? ErrorRate { get; set; }
    public bool IsLearned { get; set; }
}
