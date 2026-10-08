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
    public int AiCallCount { get; set; }
    public List<StudyStatsDayDto> Days { get; set; } = [];
    public List<StudyStatsWeekDto> Weeks { get; set; } = [];
    public List<StudyStatsForecastDto> Forecast { get; set; } = [];
    public StudyStatsRetentionDto Retention { get; set; } = new();
    public List<StudyStatsCardDto> Cards { get; set; } = [];
    public List<StudyStatsConfusionDto> Confusions { get; set; } = [];
    public StudyStatsTodayDto Today { get; set; } = new();
    public List<StudyStatsActivityDayDto> Activity { get; set; } = [];
    public StudyStatsMaturityDto Maturity { get; set; } = new();
    public List<StudyStatsDeckDto> Decks { get; set; } = [];
    public int LeechCount { get; set; }
}

public sealed class StudyStatsTodayDto
{
    public int AnswerCount { get; set; }
    public int CorrectCount { get; set; }
    public int SecondsStudied { get; set; }
    public int NewCardsIntroduced { get; set; }
    public int DailyNewCardGoal { get; set; }
}

public sealed class StudyStatsActivityDayDto
{
    public DateTime Date { get; set; }
    public int AnswerCount { get; set; }
    public int CorrectCount { get; set; }
    public int SecondsStudied { get; set; }
}

public sealed class StudyStatsMaturityDto
{
    public int New { get; set; }
    public int Learning { get; set; }
    public int Young { get; set; }
    public int Mature { get; set; }
    public int Suspended { get; set; }
}

public sealed class StudyStatsDeckDto
{
    public int DeckId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int TotalCards { get; set; }
    public int LearnedCards { get; set; }
    public int DueCards { get; set; }
    public int CorrectCount { get; set; }
    public int IncorrectCount { get; set; }
}

public sealed class StudyStatsConfusionDto
{
    public string Term { get; set; } = string.Empty;
    public string ConfusedWithTerm { get; set; } = string.Empty;
    public int Count { get; set; }
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

public sealed class StudyStatsForecastDto
{
    public DateTime Date { get; set; }
    public int DueCount { get; set; }
}

public sealed class StudyStatsRetentionDto
{
    public int AnswerCount { get; set; }
    public int CorrectCount { get; set; }
    public double? Rate { get; set; }
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
    public DateTime NextReviewDate { get; set; }
    public string DeckName { get; set; } = string.Empty;
    public bool IsLeech { get; set; }
    public bool IsSuspended { get; set; }
    public bool IsNew { get; set; }
    public DateTime? LastReviewedAt { get; set; }
}
