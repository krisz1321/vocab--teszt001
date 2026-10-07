using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public sealed class StudyService(AppDbContext dbContext, StudyAnswerToken answerToken) : IStudyService
{
    private const int LearnedStreakThreshold = 3;
    private const int ForecastDays = 30;
    private const int RetentionWindowDays = 30;
    private const int MaxAnswerDurationSeconds = 600;
    private const int MaxConfusionBonus = 10;
    public async Task<StudyNextResult> GetNextCardAsync(
        int userId,
        int? deckId,
        string? focus,
        CancellationToken cancellationToken = default)
    {
        var studyFocus = NormalizeStudyFocus(focus);
        if (deckId is int selectedDeckId &&
            !await dbContext.Decks.AsNoTracking().AnyAsync(
                deck => deck.Id == selectedDeckId && deck.UserId == userId,
                cancellationToken))
        {
            return StudyNextResult.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        var now = DateTime.UtcNow;
        var user = await dbContext.Users
            .AsNoTracking()
            .Where(candidate => candidate.Id == userId)
            .Select(candidate => new
            {
                candidate.DailyNewCardGoal,
                candidate.MinimumAnswerSeconds,
                candidate.AutomaticAiCheck,
                candidate.AcceptHungarianParaphrase,
                candidate.RequireAppealReason,
                candidate.TimeZoneId
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (user is null)
        {
            return StudyNextResult.Success(new StudyNextDto { Status = "empty" });
        }

        var localToday = StudyClock.LocalDate(user.TimeZoneId, now);
        var dayStartUtc = StudyClock.UtcStartOfLocalDate(user.TimeZoneId, localToday);
        var dayEndUtc = StudyClock.UtcStartOfLocalDate(user.TimeZoneId, localToday.AddDays(1));
        var source = UserProgress(userId, deckId, now);
        var introducedToday = await source
            .CountAsync(
                progress => progress.FirstReviewedAt >= dayStartUtc && progress.FirstReviewedAt < dayEndUtc,
                cancellationToken);

        var reviewsQuery = source.Where(progress => progress.FirstReviewedAt != null);
        if (studyFocus == "due")
        {
            reviewsQuery = reviewsQuery.Where(progress => progress.NextReviewDate <= now);
        }
        else if (studyFocus == "mistakes")
        {
            reviewsQuery = reviewsQuery.Where(progress => progress.IncorrectCount > 0);
        }

        var reviews = studyFocus == "new"
            ? []
            : await SelectCards(reviewsQuery).ToListAsync(cancellationToken);

        var newCards = new List<StudyCardDto>();
        if (studyFocus is "all" or "new" && introducedToday < user.DailyNewCardGoal)
        {
            newCards = await SelectCards(source.Where(progress => progress.FirstReviewedAt == null))
                .ToListAsync(cancellationToken);
        }

        var pool = reviews.Concat(newCards).ToList();
        if (pool.Count == 0)
        {
            var hasUnseenCards = studyFocus is "all" or "new"
                && introducedToday >= user.DailyNewCardGoal
                && await source.AnyAsync(progress => progress.FirstReviewedAt == null, cancellationToken);

            return StudyNextResult.Success(Envelope(
                user.DailyNewCardGoal,
                user.MinimumAnswerSeconds,
                user.AutomaticAiCheck,
                user.AcceptHungarianParaphrase,
                user.RequireAppealReason,
                introducedToday,
                0,
                hasUnseenCards ? "dailyLimitReached" : "empty",
                null,
                null));
        }

        var card = PickWeighted(pool, await LoadConfusionBonusesAsync(userId, cancellationToken));
        return StudyNextResult.Success(Envelope(
            user.DailyNewCardGoal,
            user.MinimumAnswerSeconds,
            user.AutomaticAiCheck,
            user.AcceptHungarianParaphrase,
            user.RequireAppealReason,
            introducedToday,
            pool.Count,
            "ready",
            card,
            answerToken.Create(userId, card.Id, now)));
    }

    public async Task<StudyStatsDto> GetStatsAsync(int userId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var rows = await dbContext.CardProgresses
            .AsNoTracking()
            .Where(progress => progress.Card.Deck.UserId == userId)
            .Select(progress => new
            {
                progress.Card.Term,
                progress.IncorrectCount,
                progress.CorrectCount,
                progress.Streak,
                progress.Interval,
                progress.NextReviewDate,
                progress.FirstReviewedAt,
                progress.SuspendedUntil,
                progress.LearnedAt
            })
            .ToListAsync(cancellationToken);

        var user = await dbContext.Users
            .AsNoTracking()
            .Where(candidate => candidate.Id == userId)
            .Select(candidate => new
            {
                candidate.StudyDayStreak,
                candidate.LongestStudyDayStreak,
                candidate.LastStudyDate,
                candidate.AiCallCount,
                candidate.TimeZoneId
            })
            .SingleOrDefaultAsync(cancellationToken);

            var today = StudyClock.LocalDate(user?.TimeZoneId, now);

        var studyDays = await dbContext.UserStudyDays
            .AsNoTracking()
            .Where(day => day.UserId == userId)
            .Select(day => new { day.DayUtc, day.SecondsStudied, day.AnswerCount, day.CorrectCount })
            .ToListAsync(cancellationToken);

        var learnedAt = rows.Select(row => row.LearnedAt).ToList();

        return new StudyStatsDto
        {
            TotalCards = rows.Count,
            DueCards = rows.Count(row => row.FirstReviewedAt != null
                && (row.SuspendedUntil == null || row.SuspendedUntil <= now)
                && row.NextReviewDate <= now),
            TotalIncorrect = rows.Sum(row => row.IncorrectCount),
            LearnedCards = rows.Count(row => row.LearnedAt != null),
            StudyDayStreak = user is null
                ? 0
                : CurrentStudyDayStreak(user.StudyDayStreak, user.LastStudyDate, today),
            LongestStudyDayStreak = user?.LongestStudyDayStreak ?? 0,
            TotalStudySeconds = studyDays.Sum(day => day.SecondsStudied),
            TodayStudySeconds = studyDays
                .Where(day => day.DayUtc.Date == today)
                .Sum(day => day.SecondsStudied),
            AiCallCount = user?.AiCallCount ?? 0,
            Days = BuildLearnedDays(learnedAt, today, user?.TimeZoneId),
            Weeks = BuildLearnedWeeks(learnedAt, today, user?.TimeZoneId),
            Forecast = BuildForecast(
                rows.Where(row => row.FirstReviewedAt != null)
                    .Select(row => row.SuspendedUntil is DateTime until && until > now && until > row.NextReviewDate
                        ? until
                        : row.NextReviewDate)
                    .ToList(),
                now,
                today,
                user?.TimeZoneId),
            Retention = BuildRetention(
                studyDays.Where(day => day.DayUtc.Date > today.AddDays(-RetentionWindowDays))
                    .Select(day => (day.AnswerCount, day.CorrectCount))
                    .ToList()),
            Cards = rows
                .Select(row =>
                {
                    var attempts = row.CorrectCount + row.IncorrectCount;
                    return new StudyStatsCardDto
                    {
                        Term = row.Term,
                        IncorrectCount = row.IncorrectCount,
                        Streak = row.Streak,
                        Interval = row.Interval,
                        CorrectCount = row.CorrectCount,
                        ErrorRate = attempts == 0 ? null : (double)row.IncorrectCount / attempts,
                        IsLearned = row.LearnedAt != null,
                        NextReviewDate = row.NextReviewDate
                    };
                })
                .OrderBy(card => card.CorrectCount + card.IncorrectCount == 0)
                .ThenByDescending(card => card.ErrorRate)
                .ThenByDescending(card => card.IncorrectCount)
                .ThenBy(card => card.Term, StringComparer.OrdinalIgnoreCase)
                .ToList(),
            Confusions = await LoadTopConfusionsAsync(userId, cancellationToken)
        };
    }

    public async Task<StudySettingsDto?> GetSettingsAsync(int userId, CancellationToken cancellationToken = default)
    {
        return await dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new StudySettingsDto
            {
                DailyNewCardGoal = user.DailyNewCardGoal,
                MinimumAnswerSeconds = user.MinimumAnswerSeconds,
                AutomaticAiCheck = user.AutomaticAiCheck,
                AcceptHungarianParaphrase = user.AcceptHungarianParaphrase,
                RequireAppealReason = user.RequireAppealReason,
                ReuseSavedExamples = user.ReuseSavedExamples,
                SavedLevelPolicy = user.SavedLevelPolicy,
                GenerateAlternateDefinitions = user.GenerateAlternateDefinitions,
                ExampleLevel = user.ExampleLevel,
                AiModel = user.AiModel,
                TimeZoneId = user.TimeZoneId
            })
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task<StudySettingsResult> UpdateSettingsAsync(
        int userId,
        StudySettingsDto request,
        CancellationToken cancellationToken = default)
    {
        var exampleLevel = request.ExampleLevel?.Trim();
        if (!ExampleLevels.IsAllowed(exampleLevel))
        {
            return StudySettingsResult.Fail(StatusCodes.Status400BadRequest, "A mondatszint érvénytelen.");
        }

        var aiModel = request.AiModel?.Trim();
        if (!AiModels.IsAllowed(aiModel))
        {
            return StudySettingsResult.Fail(StatusCodes.Status400BadRequest, "Az MI-modell érvénytelen.");
        }

        var savedLevelPolicy = request.SavedLevelPolicy?.Trim();
        if (!SavedLevelPolicies.IsAllowed(savedLevelPolicy))
        {
            return StudySettingsResult.Fail(StatusCodes.Status400BadRequest, "A mentett szintek szabálya érvénytelen.");
        }

        var timeZoneId = StudyClock.NormalizeTimeZoneId(request.TimeZoneId);

        var user = await dbContext.Users.SingleOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return StudySettingsResult.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.");
        }

        user.DailyNewCardGoal = request.DailyNewCardGoal;
        user.MinimumAnswerSeconds = request.MinimumAnswerSeconds;
        user.AutomaticAiCheck = request.AutomaticAiCheck;
        user.AcceptHungarianParaphrase = request.AcceptHungarianParaphrase;
        user.RequireAppealReason = request.RequireAppealReason;
        user.ReuseSavedExamples = request.ReuseSavedExamples;
        user.SavedLevelPolicy = savedLevelPolicy;
        user.GenerateAlternateDefinitions = request.GenerateAlternateDefinitions;
        user.ExampleLevel = exampleLevel;
        user.AiModel = aiModel;
        user.TimeZoneId = timeZoneId;
        await dbContext.SaveChangesAsync(cancellationToken);
        return StudySettingsResult.Success(new StudySettingsDto
        {
            DailyNewCardGoal = user.DailyNewCardGoal,
            MinimumAnswerSeconds = user.MinimumAnswerSeconds,
            AutomaticAiCheck = user.AutomaticAiCheck,
            AcceptHungarianParaphrase = user.AcceptHungarianParaphrase,
            RequireAppealReason = user.RequireAppealReason,
            ReuseSavedExamples = user.ReuseSavedExamples,
            SavedLevelPolicy = user.SavedLevelPolicy,
            GenerateAlternateDefinitions = user.GenerateAlternateDefinitions,
            ExampleLevel = user.ExampleLevel,
            AiModel = user.AiModel,
            TimeZoneId = user.TimeZoneId
        });
    }

    public async Task<StudySubmitResult> SubmitAsync(
        int userId,
        StudySubmitDto request,
        CancellationToken cancellationToken = default)
    {
        var progress = await dbContext.CardProgresses
            .SingleOrDefaultAsync(
                item => item.CardId == request.CardId && item.Card.Deck.UserId == userId,
                cancellationToken);

        if (progress is null)
        {
            return StudySubmitResult.Fail(StatusCodes.Status404NotFound, "A kártya nem található.");
        }

        var user = await dbContext.Users
            .SingleOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);

        if (user is null)
        {
            return StudySubmitResult.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.");
        }

        var now = DateTime.UtcNow;
        var evaluation = answerToken.Evaluate(
            request.AnswerToken,
            userId,
            request.CardId,
            user.MinimumAnswerSeconds,
            now);

        if (evaluation.Status == StudyAnswerTokenStatus.Invalid)
        {
            return StudySubmitResult.Fail(StatusCodes.Status400BadRequest, "Érvénytelen válasz-azonosító, töltsd be újra a kártyát.");
        }

        if (evaluation.Status == StudyAnswerTokenStatus.TooEarly)
        {
            return StudySubmitResult.Fail(StatusCodes.Status400BadRequest, "A választ túl korán küldted be.");
        }

        if (progress.FirstReviewedAt is null)
        {
            progress.FirstReviewedAt = now;
        }

        progress.LastReviewedAt = now;

        if (request.IsCorrect)
        {
            progress.CorrectCount = SaturatingIncrement(progress.CorrectCount);
            var previousInterval = progress.Interval;
            progress.EaseFactor = Sm2Scheduler.NextEaseFactor(progress.EaseFactor, isCorrect: true);
            progress.Streak = SaturatingIncrement(progress.Streak);
            progress.Interval = Sm2Scheduler.NextInterval(progress.Streak, previousInterval, progress.EaseFactor);
            var availableDays = Math.Max(0, (DateTime.MaxValue - now).TotalDays);
            progress.NextReviewDate = progress.Interval > availableDays
                ? DateTime.MaxValue
                : now.AddDays(progress.Interval);
            if (progress.LearnedAt is null && progress.Streak >= LearnedStreakThreshold)
            {
                progress.LearnedAt = now;
            }
        }
        else
        {
            progress.EaseFactor = Sm2Scheduler.NextEaseFactor(progress.EaseFactor, isCorrect: false);
            progress.Streak = 0;
            progress.Interval = 0;
            progress.IncorrectCount = SaturatingIncrement(progress.IncorrectCount);
            progress.NextReviewDate = now;
        }

        var today = StudyClock.LocalDate(user.TimeZoneId, now);
        var studiedSeconds = evaluation.ShownAtUtc is DateTime shownAt
            ? ClampAnswerSeconds(shownAt, now)
            : 0;
        ApplyStudyDayStreak(user, today);
        await RecordStudyDayAsync(userId, today, studiedSeconds, request.IsCorrect, cancellationToken);
        var confusedWithTerm = request.IsCorrect
            ? null
            : await RecordConfusionAsync(userId, progress.CardId, request.TypedAnswer, now, cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);

        return StudySubmitResult.Success(new CardProgressDto
        {
            CardId = progress.CardId,
            NextReviewDate = progress.NextReviewDate,
            EaseFactor = progress.EaseFactor,
            Interval = progress.Interval,
            Streak = progress.Streak,
            IncorrectCount = progress.IncorrectCount,
            ConfusedWithTerm = confusedWithTerm
        });
    }

    private IQueryable<CardProgress> UserProgress(int userId, int? deckId, DateTime now)
    {
        var query = dbContext.CardProgresses
            .AsNoTracking()
            .Where(progress => progress.Card.Deck.UserId == userId
                && (progress.SuspendedUntil == null || progress.SuspendedUntil <= now));

        if (deckId is int selectedDeckId)
        {
            query = query.Where(progress => progress.Card.DeckId == selectedDeckId);
        }

        return query;
    }

    private static string NormalizeStudyFocus(string? focus) => focus?.Trim().ToLowerInvariant() switch
    {
        "due" => "due",
        "mistakes" => "mistakes",
        "new" => "new",
        _ => "all"
    };

    private static IQueryable<StudyCardDto> SelectCards(IQueryable<CardProgress> progresses) =>
        progresses.Select(progress => new StudyCardDto
        {
            Id = progress.CardId,
            Term = progress.Card.Term,
            Definition = progress.Card.Definition,
            Example = progress.Card.Example,
            TargetMeanings = progress.Card.TargetMeanings,
            NextReviewDate = progress.NextReviewDate,
            EaseFactor = progress.EaseFactor,
            Interval = progress.Interval,
            Streak = progress.Streak,
            IncorrectCount = progress.IncorrectCount
        });

    private static StudyNextDto Envelope(
        int dailyNewCardGoal,
        int minimumAnswerSeconds,
        bool automaticAiCheck,
        bool acceptHungarianParaphrase,
        bool requireAppealReason,
        int newCardsIntroducedToday,
        int availableCards,
        string status,
        StudyCardDto? card,
        string? answerToken) =>
        new()
        {
            DailyNewCardGoal = dailyNewCardGoal,
            MinimumAnswerSeconds = minimumAnswerSeconds,
            AutomaticAiCheck = automaticAiCheck,
            AcceptHungarianParaphrase = acceptHungarianParaphrase,
            RequireAppealReason = requireAppealReason,
            NewCardsIntroducedToday = newCardsIntroducedToday,
            AvailableCards = availableCards,
            Status = status,
            Card = card,
            AnswerToken = answerToken
        };

    private static StudyCardDto PickWeighted(
        IReadOnlyList<StudyCardDto> cards,
        IReadOnlyDictionary<int, int> confusionBonuses)
    {
        var totalWeight = cards.Aggregate(0L, (sum, card) => sum + CardWeight(card, confusionBonuses));
        var roll = Random.Shared.NextInt64(totalWeight);
        var cursor = 0L;
        foreach (var card in cards)
        {
            cursor += CardWeight(card, confusionBonuses);
            if (roll < cursor)
            {
                return card;
            }
        }

        return cards[^1];
    }

    private static long CardWeight(StudyCardDto card, IReadOnlyDictionary<int, int> confusionBonuses)
    {
        var bonus = 0;
        if (confusionBonuses.TryGetValue(card.Id, out var rawBonus))
        {
            bonus = Math.Min(rawBonus, MaxConfusionBonus);
        }

        return card.IncorrectCount + 1L + bonus;
    }

    private async Task<Dictionary<int, int>> LoadConfusionBonusesAsync(
        int userId,
        CancellationToken cancellationToken)
    {
        var rows = await dbContext.CardConfusions
            .AsNoTracking()
            .Where(confusion => confusion.UserId == userId)
            .Select(confusion => new { confusion.CardId, confusion.ConfusedWithCardId, confusion.Count })
            .ToListAsync(cancellationToken);

        var bonuses = new Dictionary<int, int>();
        foreach (var row in rows)
        {
            AddConfusionBonus(bonuses, row.CardId, row.Count);
            AddConfusionBonus(bonuses, row.ConfusedWithCardId, row.Count);
        }

        return bonuses;
    }

    private static void AddConfusionBonus(Dictionary<int, int> bonuses, int cardId, int count)
    {
        bonuses.TryGetValue(cardId, out var current);
        bonuses[cardId] = SaturatingAdd(current, count);
    }

    private async Task<List<StudyStatsConfusionDto>> LoadTopConfusionsAsync(
        int userId,
        CancellationToken cancellationToken)
    {
        return await dbContext.CardConfusions
            .AsNoTracking()
            .Where(confusion => confusion.UserId == userId)
            .OrderByDescending(confusion => confusion.Count)
            .ThenBy(confusion => confusion.Card.Term)
            .Take(10)
            .Select(confusion => new StudyStatsConfusionDto
            {
                Term = confusion.Card.Term,
                ConfusedWithTerm = confusion.ConfusedWithCard.Term,
                Count = confusion.Count
            })
            .ToListAsync(cancellationToken);
    }

    private async Task<string?> RecordConfusionAsync(
        int userId,
        int cardId,
        string? typedAnswer,
        DateTime now,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(typedAnswer))
        {
            return null;
        }

        var normalized = NormalizeTerm(typedAnswer);
        if (normalized.Length == 0)
        {
            return null;
        }

        var cards = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.Deck.UserId == userId)
            .Select(card => new { card.Id, card.Term })
            .ToListAsync(cancellationToken);

        var asked = cards.FirstOrDefault(card => card.Id == cardId);
        if (asked is null || NormalizeTerm(asked.Term) == normalized)
        {
            return null;
        }

        var match = cards
            .Where(card => card.Id != cardId && NormalizeTerm(card.Term) == normalized)
            .OrderBy(card => card.Id)
            .FirstOrDefault();
        if (match is null)
        {
            return null;
        }

        var existing = await dbContext.CardConfusions.SingleOrDefaultAsync(
            confusion => confusion.UserId == userId
                && confusion.CardId == cardId
                && confusion.ConfusedWithCardId == match.Id,
            cancellationToken);

        if (existing is null)
        {
            dbContext.CardConfusions.Add(new CardConfusion
            {
                UserId = userId,
                CardId = cardId,
                ConfusedWithCardId = match.Id,
                Count = 1,
                LastConfusedAt = now
            });
        }
        else
        {
            existing.Count = SaturatingIncrement(existing.Count);
            existing.LastConfusedAt = now;
        }

        return match.Term;
    }

    private static string NormalizeTerm(string value)
    {
        var parts = value.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts).ToLowerInvariant();
    }

    private async Task RecordStudyDayAsync(
        int userId,
        DateTime today,
        int studiedSeconds,
        bool isCorrect,
        CancellationToken cancellationToken)
    {
        var day = await dbContext.UserStudyDays
            .SingleOrDefaultAsync(
                item => item.UserId == userId && item.DayUtc == today,
                cancellationToken);

        if (day is null)
        {
            day = new UserStudyDay
            {
                UserId = userId,
                DayUtc = today
            };
            dbContext.UserStudyDays.Add(day);
        }

        day.SecondsStudied = SaturatingAdd(day.SecondsStudied, studiedSeconds);
        day.AnswerCount = SaturatingIncrement(day.AnswerCount);
        if (isCorrect)
        {
            day.CorrectCount = SaturatingIncrement(day.CorrectCount);
        }
        else
        {
            day.IncorrectCount = SaturatingIncrement(day.IncorrectCount);
        }
    }

    private static void ApplyStudyDayStreak(User user, DateTime today)
    {
        var lastDay = user.LastStudyDate?.Date;
        if (lastDay == today.AddDays(-1))
        {
            user.StudyDayStreak = SaturatingIncrement(user.StudyDayStreak);
        }
        else if (lastDay != today)
        {
            user.StudyDayStreak = 1;
        }

        user.LastStudyDate = today;
        if (user.StudyDayStreak > user.LongestStudyDayStreak)
        {
            user.LongestStudyDayStreak = user.StudyDayStreak;
        }
    }

    public static int CurrentStudyDayStreak(int storedStreak, DateTime? lastStudyDate, DateTime today)
    {
        var lastDay = lastStudyDate?.Date;
        if (lastDay == today || lastDay == today.AddDays(-1))
        {
            return storedStreak;
        }

        return 0;
    }

    private static List<StudyStatsDayDto> BuildLearnedDays(
        IReadOnlyList<DateTime?> learnedAt,
        DateTime today,
        string? timeZoneId)
    {
        var windowStart = today.AddDays(-13);
        var localDates = learnedAt
            .Where(value => value is not null)
            .Select(value => StudyClock.LocalDateFromStoredUtc(timeZoneId, value!.Value))
            .ToList();
        var cumulative = localDates.Count(learned => learned < windowStart);
        var days = new List<StudyStatsDayDto>(14);
        for (var index = 0; index < 14; index++)
        {
            var date = windowStart.AddDays(index);
            var next = date.AddDays(1);
            var added = localDates.Count(learned => learned >= date && learned < next);
            cumulative += added;
            days.Add(new StudyStatsDayDto
            {
                Date = date,
                NewLearned = added,
                CumulativeLearned = cumulative
            });
        }

        return days;
    }

    private static List<StudyStatsWeekDto> BuildLearnedWeeks(
        IReadOnlyList<DateTime?> learnedAt,
        DateTime today,
        string? timeZoneId)
    {
        var currentWeek = StartOfWeek(today);
        var localDates = learnedAt
            .Where(value => value is not null)
            .Select(value => StudyClock.LocalDateFromStoredUtc(timeZoneId, value!.Value))
            .ToList();
        var weeks = new List<StudyStatsWeekDto>(4);
        for (var index = 3; index >= 0; index--)
        {
            var start = currentWeek.AddDays(-7 * index);
            var end = start.AddDays(7);
            weeks.Add(new StudyStatsWeekDto
            {
                WeekStart = start,
                NewLearned = localDates.Count(learned => learned >= start && learned < end)
            });
        }

        return weeks;
    }

    private static List<StudyStatsForecastDto> BuildForecast(
        IReadOnlyList<DateTime> nextReviews,
        DateTime now,
        DateTime today,
        string? timeZoneId)
    {
        var windowEndUtc = StudyClock.UtcStartOfLocalDate(timeZoneId, today.AddDays(ForecastDays));
        var counts = new int[ForecastDays];
        foreach (var nextReview in nextReviews)
        {
            if (nextReview >= windowEndUtc)
            {
                continue;
            }

            // A lejárt kártyák a mai napra számítanak, mert azonnal ismételhetők.
            var localDate = nextReview <= now
                ? today
                : StudyClock.LocalDateFromStoredUtc(timeZoneId, nextReview);
            var index = (int)(localDate - today).TotalDays;
            counts[Math.Clamp(index, 0, ForecastDays - 1)]++;
        }

        return Enumerable.Range(0, ForecastDays)
            .Select(index => new StudyStatsForecastDto { Date = today.AddDays(index), DueCount = counts[index] })
            .ToList();
    }

    private static StudyStatsRetentionDto BuildRetention(IReadOnlyList<(int AnswerCount, int CorrectCount)> days)
    {
        var answers = days.Sum(day => (long)day.AnswerCount);
        var correct = days.Sum(day => (long)day.CorrectCount);
        return new StudyStatsRetentionDto
        {
            AnswerCount = (int)Math.Min(answers, int.MaxValue),
            CorrectCount = (int)Math.Min(correct, int.MaxValue),
            Rate = answers == 0 ? null : (double)correct / answers
        };
    }

    private static DateTime StartOfWeek(DateTime day)
    {
        var daysSinceMonday = day.DayOfWeek == DayOfWeek.Sunday ? 6 : (int)day.DayOfWeek - 1;
        return day.AddDays(-daysSinceMonday);
    }

    private static int ClampAnswerSeconds(DateTime shownAtUtc, DateTime now)
    {
        var seconds = (long)Math.Floor((now - shownAtUtc).TotalSeconds);
        if (seconds < 0)
        {
            return 0;
        }

        if (seconds > MaxAnswerDurationSeconds)
        {
            return MaxAnswerDurationSeconds;
        }

        return (int)seconds;
    }

    private static int SaturatingIncrement(int value) =>
        value == int.MaxValue ? int.MaxValue : value + 1;

    private static int SaturatingAdd(int value, int addend)
    {
        if (addend <= 0)
        {
            return value;
        }

        return value > int.MaxValue - addend ? int.MaxValue : value + addend;
    }
}
