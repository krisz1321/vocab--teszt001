using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using VocabApp.Api.DTOs;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

[Collection(ApiCollection.Name)]
public class StudyApiTests(ApiFactory factory)
{
    /// <summary>Új felhasználó, aki azonnal, várakozás és napi korlát nélkül tud válaszolni.</summary>
    private async Task<TestUser> EasyUserAsync()
    {
        var user = await factory.RegisterUserAsync();
        await user.MakeStudyEasyAsync();
        return user;
    }

    private static async Task<string?> ErrorCodeAsync(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.TryGetProperty("code", out var code) ? code.GetString() : null;
    }

    /// <summary>Egy kártyás pakli, amelyből mindig ugyanaz a kártya jön.</summary>
    private static async Task<(DeckDto Deck, CardDto Card)> SingleCardDeckAsync(TestUser user, string term = "solo")
    {
        var deck = await user.CreateDeckAsync();
        return (deck, await user.CreateCardAsync(deck.Id, term, "the only card"));
    }

    // ---- következő kártya ----

    [Fact]
    public async Task Next_WithoutCards_IsEmpty()
    {
        var user = await EasyUserAsync();

        var next = await user.NextAsync();

        Assert.Equal("empty", next.Status);
        Assert.Null(next.Card);
        Assert.Null(next.AnswerToken);
        Assert.Equal(0, next.AvailableCards);
    }

    [Fact]
    public async Task Next_WithNewCard_IsReadyWithTokenAndSettings()
    {
        var user = await EasyUserAsync();
        var (_, card) = await SingleCardDeckAsync(user);

        var next = await user.NextAsync();

        Assert.Equal("ready", next.Status);
        Assert.Equal(card.Id, next.Card!.Id);
        Assert.Equal("solo", next.Card.Term);
        Assert.Equal(0, next.Card.Streak);
        Assert.Equal(2.5f, next.Card.EaseFactor);
        Assert.False(string.IsNullOrEmpty(next.AnswerToken));
        Assert.Equal(1, next.AvailableCards);
        Assert.Equal(100, next.DailyNewCardGoal);
        Assert.Equal(0, next.NewCardsIntroducedToday);
        Assert.True(next.AiCheckAvailable);
    }

    [Fact]
    public async Task Next_DeckFilter_OnlyReturnsCardsFromThatDeck()
    {
        var user = await EasyUserAsync();
        var (deckA, cardA) = await SingleCardDeckAsync(user, "alpha");
        var (deckB, cardB) = await SingleCardDeckAsync(user, "beta");

        for (var i = 0; i < 10; i++)
        {
            Assert.Equal(cardA.Id, (await user.NextAsync($"?deckId={deckA.Id}")).Card!.Id);
            Assert.Equal(cardB.Id, (await user.NextAsync($"?deckId={deckB.Id}")).Card!.Id);
        }
    }

    [Fact]
    public async Task Next_UnknownOrForeignDeck_Returns404()
    {
        var owner = await EasyUserAsync();
        var intruder = await EasyUserAsync();
        var (deck, _) = await SingleCardDeckAsync(owner);

        await (await intruder.Client.GetAsync($"/api/study/next?deckId={deck.Id}")).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.GetAsync("/api/study/next?deckId=99999999")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Next_NeverReturnsAnotherUsersCards()
    {
        var owner = await EasyUserAsync();
        var other = await EasyUserAsync();
        await SingleCardDeckAsync(owner);

        Assert.Equal("empty", (await other.NextAsync()).Status);
    }

    [Fact]
    public async Task Next_CardAnsweredCorrectly_IsNotDueAgainToday()
    {
        var user = await EasyUserAsync();
        var (deck, _) = await SingleCardDeckAsync(user);
        (await user.SubmitAsync(await user.NextAsync(), isCorrect: true)).EnsureSuccessStatusCode();

        var next = await user.NextAsync($"?deckId={deck.Id}");

        Assert.Equal("empty", next.Status);
        Assert.Equal(1, next.NewCardsIntroducedToday);
    }

    [Fact]
    public async Task Next_CardAnsweredWrongly_ComesBackImmediately()
    {
        var user = await EasyUserAsync();
        var (_, card) = await SingleCardDeckAsync(user);
        (await user.SubmitAsync(await user.NextAsync(), isCorrect: false)).EnsureSuccessStatusCode();

        var next = await user.NextAsync();

        Assert.Equal("ready", next.Status);
        Assert.Equal(card.Id, next.Card!.Id);
        Assert.Equal(1, next.Card.IncorrectCount);
    }

    [Fact]
    public async Task Next_DueCardIsOfferedAgainOnceItsDateArrives()
    {
        var user = await EasyUserAsync();
        var (deck, card) = await SingleCardDeckAsync(user);
        (await user.SubmitAsync(await user.NextAsync(), isCorrect: true)).EnsureSuccessStatusCode();
        Assert.Equal("empty", (await user.NextAsync($"?deckId={deck.Id}")).Status);

        await factory.MakeCardDueAsync(card.Id);

        var next = await user.NextAsync($"?deckId={deck.Id}");
        Assert.Equal("ready", next.Status);
        Assert.Equal(1, next.Card!.Streak);
    }

    [Fact]
    public async Task Next_Focus_NewDueAndMistakes()
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var fresh = await user.CreateCardAsync(deck.Id, "fresh", "new card");
        var wrong = await user.CreateCardAsync(deck.Id, "wrong", "failed card");
        var right = await user.CreateCardAsync(deck.Id, "right", "passed card");
        await SubmitSpecificAsync(user, wrong.Id, false);
        await SubmitSpecificAsync(user, right.Id, true);
        await factory.MakeCardDueAsync(right.Id);

        // csak új kártyák
        for (var i = 0; i < 15; i++)
        {
            Assert.Equal(fresh.Id, (await user.NextAsync($"?deckId={deck.Id}&focus=new")).Card!.Id);
        }

        // esedékes: a hibás (azonnal esedékes) és a lejárt "right", de az új nem
        var dueIds = new HashSet<int>();
        for (var i = 0; i < 60; i++)
        {
            dueIds.Add((await user.NextAsync($"?deckId={deck.Id}&focus=due")).Card!.Id);
        }

        Assert.DoesNotContain(fresh.Id, dueIds);
        Assert.Contains(wrong.Id, dueIds);
        Assert.Contains(right.Id, dueIds);

        // hibás: csak az a kártya, amelyiknél volt hiba
        for (var i = 0; i < 15; i++)
        {
            Assert.Equal(wrong.Id, (await user.NextAsync($"?deckId={deck.Id}&focus=mistakes")).Card!.Id);
        }
    }

    [Fact]
    public async Task Next_FocusDueWithOnlyNewCards_IsEmpty()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);

        Assert.Equal("empty", (await user.NextAsync("?focus=due")).Status);
        Assert.Equal("empty", (await user.NextAsync("?focus=mistakes")).Status);
    }

    [Theory]
    [InlineData("")]
    [InlineData("?focus=bogus")]
    [InlineData("?focus=ALL")]
    public async Task Next_UnknownFocus_FallsBackToAll(string query)
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);

        Assert.Equal("ready", (await user.NextAsync(query)).Status);
    }

    [Fact]
    public async Task Next_TagFilter_OnlyReturnsMatchingCards()
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var tagged = await user.CreateCardAsync(deck.Id, "tagged", "d", tags: "food,drink");
        await user.CreateCardAsync(deck.Id, "other", "d", tags: "travel");
        await user.CreateCardAsync(deck.Id, "none", "d");

        for (var i = 0; i < 15; i++)
        {
            Assert.Equal(tagged.Id, (await user.NextAsync("?tag=Food")).Card!.Id);
        }

        Assert.Equal("empty", (await user.NextAsync("?tag=nonexistent")).Status);
    }

    [Fact]
    public async Task Next_TagFilter_DoesNotMatchPartialTagNames()
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        await user.CreateCardAsync(deck.Id, "a", "d", tags: "seafood");

        Assert.Equal("empty", (await user.NextAsync("?tag=food")).Status);
    }

    [Fact]
    public async Task Next_DailyNewCardGoalReached_ReportsDailyLimit_ButStillOffersDueReviews()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s =>
        {
            s.MinimumAnswerSeconds = 0;
            s.DailyNewCardGoal = 1;
        });
        var deck = await user.CreateDeckAsync();
        var first = await user.CreateCardAsync(deck.Id, "first", "d");
        await user.CreateCardAsync(deck.Id, "second", "d");
        await SubmitSpecificAsync(user, first.Id, true);

        var limited = await user.NextAsync($"?deckId={deck.Id}");
        Assert.Equal("dailyLimitReached", limited.Status);
        Assert.Equal(1, limited.NewCardsIntroducedToday);
        Assert.Equal(1, limited.DailyNewCardGoal);
        Assert.Null(limited.Card);

        // az esedékes ismétlés a napi új kártya korláttól függetlenül jön
        await factory.MakeCardDueAsync(first.Id);
        var review = await user.NextAsync($"?deckId={deck.Id}");
        Assert.Equal("ready", review.Status);
        Assert.Equal(first.Id, review.Card!.Id);
    }

    [Fact]
    public async Task Next_GoalZero_NeverIntroducesNewCards()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s => s.DailyNewCardGoal = 0);
        await SingleCardDeckAsync(user);

        Assert.Equal("dailyLimitReached", (await user.NextAsync()).Status);
    }

    [Fact]
    public async Task Next_DailyGoalCountsAcrossAllDecks()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s =>
        {
            s.MinimumAnswerSeconds = 0;
            s.DailyNewCardGoal = 1;
        });
        var (_, cardA) = await SingleCardDeckAsync(user, "a");
        var (deckB, _) = await SingleCardDeckAsync(user, "b");
        await SubmitSpecificAsync(user, cardA.Id, true);

        Assert.Equal("dailyLimitReached", (await user.NextAsync($"?deckId={deckB.Id}")).Status);
    }

    [Fact]
    public async Task Next_SuspendedCardsAreSkipped()
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var kept = await user.CreateCardAsync(deck.Id, "kept", "d");
        var hidden = await user.CreateCardAsync(deck.Id, "hidden", "d");
        await user.PutJsonAsync($"/api/cards/{hidden.Id}/suspension", new SetCardSuspensionDto { Mode = "suspended" });

        for (var i = 0; i < 15; i++)
        {
            Assert.Equal(kept.Id, (await user.NextAsync($"?deckId={deck.Id}")).Card!.Id);
        }
    }

    [Fact]
    public async Task Next_MarkedKnownCardIsNotOfferedAsNew()
    {
        var user = await EasyUserAsync();
        var (deck, card) = await SingleCardDeckAsync(user);
        await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true });

        Assert.Equal("empty", (await user.NextAsync($"?deckId={deck.Id}")).Status);
    }

    [Fact]
    public async Task Next_ReflectsUserSettingsInTheEnvelope()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s =>
        {
            s.MinimumAnswerSeconds = 7;
            s.AutomaticAiCheck = false;
            s.AcceptHungarianParaphrase = true;
            s.AcceptPartialMeaningMatch = false;
            s.RepeatMistakes = false;
            s.RequireAppealReason = false;
        });
        await SingleCardDeckAsync(user);

        var next = await user.NextAsync();

        Assert.Equal(7, next.MinimumAnswerSeconds);
        Assert.False(next.AutomaticAiCheck);
        Assert.True(next.AcceptHungarianParaphrase);
        Assert.False(next.AcceptPartialMeaningMatch);
        Assert.False(next.RepeatMistakes);
        Assert.False(next.RequireAppealReason);
    }

    [Fact]
    public async Task Next_EnvelopeAlsoCarriesSettingsWhenThereIsNothingToStudy()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s => s.MinimumAnswerSeconds = 9);

        var next = await user.NextAsync();

        Assert.Equal("empty", next.Status);
        Assert.Equal(9, next.MinimumAnswerSeconds);
    }

    // ---- válasz beküldése (SM-2) ----

    private static async Task<HttpResponseMessage> SubmitSpecificAsync(TestUser user, int cardId, bool isCorrect, string? typed = null)
    {
        for (var i = 0; i < 300; i++)
        {
            var next = await user.NextAsync();
            if (next.Card?.Id == cardId)
            {
                var response = await user.PostJsonAsync(
                    "/api/study/submit",
                    new StudySubmitDto { CardId = cardId, IsCorrect = isCorrect, AnswerToken = next.AnswerToken!, TypedAnswer = typed });
                response.EnsureSuccessStatusCode();
                return response;
            }
        }

        throw new InvalidOperationException($"A(z) {cardId} kártya nem jött fel.");
    }

    [Fact]
    public async Task Submit_FirstCorrectAnswer_SchedulesOneDay()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);
        var next = await user.NextAsync();

        var response = await user.SubmitAsync(next, isCorrect: true);

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var progress = await response.ReadAsync<CardProgressDto>();
        Assert.Equal(next.Card!.Id, progress.CardId);
        Assert.Equal(1, progress.Streak);
        Assert.Equal(1, progress.Interval);
        Assert.Equal(2.5f, progress.EaseFactor);
        Assert.Equal(0, progress.IncorrectCount);
        Assert.Null(progress.ConfusedWithTerm);
        Assert.InRange((progress.NextReviewDate - DateTime.UtcNow).TotalHours, 23.9, 24.1);
    }

    [Fact]
    public async Task Submit_CorrectAnswersFollowTheSm2Intervals_AndTheCardBecomesLearnedAtStreakThree()
    {
        var user = await EasyUserAsync();
        var (deck, card) = await SingleCardDeckAsync(user);
        var intervals = new List<int>();

        for (var round = 0; round < 4; round++)
        {
            await factory.MakeCardDueAsync(card.Id);
            var next = await user.NextAsync($"?deckId={deck.Id}");
            var progress = await (await user.SubmitAsync(next, isCorrect: true)).ReadAsync<CardProgressDto>();
            intervals.Add(progress.Interval);
            Assert.Equal(round + 1, progress.Streak);
            if (round == 1)
            {
                Assert.Empty(await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned"));
            }
        }

        Assert.Equal([1, 6, 15, 38], intervals);
        var learned = Assert.Single(await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned"));
        Assert.Equal(card.Id, learned.Id);
        Assert.False(learned.MarkedKnown);
        Assert.Equal(4, learned.CorrectCount);
    }

    [Fact]
    public async Task Submit_WrongAnswer_ResetsStreakAndLowersEaseFactor()
    {
        var user = await EasyUserAsync();
        var (deck, card) = await SingleCardDeckAsync(user);
        await user.SubmitAsync(await user.NextAsync(), isCorrect: true);
        await factory.MakeCardDueAsync(card.Id);

        var progress = await (await user.SubmitAsync(await user.NextAsync($"?deckId={deck.Id}"), isCorrect: false)).ReadAsync<CardProgressDto>();

        Assert.Equal(0, progress.Streak);
        Assert.Equal(0, progress.Interval);
        Assert.Equal(1, progress.IncorrectCount);
        Assert.Equal(2.18f, progress.EaseFactor, 2);
        Assert.InRange((progress.NextReviewDate - DateTime.UtcNow).TotalMinutes, -1, 1);
    }

    [Fact]
    public async Task Submit_RepeatedWrongAnswers_NeverLowerEaseFactorBelowMinimum()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);
        CardProgressDto? last = null;

        for (var i = 0; i < 12; i++)
        {
            last = await (await user.SubmitAsync(await user.NextAsync(), isCorrect: false)).ReadAsync<CardProgressDto>();
        }

        Assert.Equal(1.3f, last!.EaseFactor);
        Assert.Equal(12, last.IncorrectCount);
    }

    [Fact]
    public async Task Submit_AfterAWrongAnswerTheStreakRestartsFromOne()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);
        await user.SubmitAsync(await user.NextAsync(), isCorrect: false);

        var progress = await (await user.SubmitAsync(await user.NextAsync(), isCorrect: true)).ReadAsync<CardProgressDto>();

        Assert.Equal(1, progress.Streak);
        Assert.Equal(1, progress.Interval);
    }

    [Fact]
    public async Task Submit_GarbageToken_Returns400WithTokenInvalidCode()
    {
        var user = await EasyUserAsync();
        var (_, card) = await SingleCardDeckAsync(user);

        var response = await user.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = card.Id, IsCorrect = true, AnswerToken = "garbage" });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("answer-token-invalid", await ErrorCodeAsync(response));
    }

    [Fact]
    public async Task Submit_TokenOfAnotherCard_IsRejected()
    {
        var user = await EasyUserAsync();
        var deckA = await user.CreateDeckAsync();
        var deckB = await user.CreateDeckAsync();
        var cardA = await user.CreateCardAsync(deckA.Id, "a", "d");
        var cardB = await user.CreateCardAsync(deckB.Id, "b", "d");
        var tokenForA = (await user.NextAsync($"?deckId={deckA.Id}")).AnswerToken!;

        var response = await user.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = cardB.Id, IsCorrect = true, AnswerToken = tokenForA });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("answer-token-invalid", await ErrorCodeAsync(response));
        Assert.NotEqual(cardA.Id, cardB.Id);
    }

    [Fact]
    public async Task Submit_TokenOfAnotherUser_IsRejected()
    {
        var owner = await EasyUserAsync();
        var thief = await EasyUserAsync();
        await SingleCardDeckAsync(owner);
        var next = await owner.NextAsync();

        // a tolvaj a saját kártyájára próbálja használni az idegen tokent
        var (_, ownCard) = await SingleCardDeckAsync(thief);
        var response = await thief.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = ownCard.Id, IsCorrect = true, AnswerToken = next.AnswerToken! });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Submit_AnsweringTooFast_Returns400WithTooEarlyCode_AndKeepsProgress()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s =>
        {
            s.MinimumAnswerSeconds = 30;
            s.DailyNewCardGoal = 100;
        });
        var (_, card) = await SingleCardDeckAsync(user);
        var next = await user.NextAsync();

        var response = await user.SubmitAsync(next, isCorrect: true);

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("answer-too-early", await ErrorCodeAsync(response));
        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.True(stats.Cards.Single(c => c.Term == card.Term).IsNew);
        Assert.Equal(0, stats.Today.AnswerCount);
    }

    [Fact]
    public async Task Submit_InvalidBody_Returns400WithValidationErrors()
    {
        var user = await EasyUserAsync();
        var (_, card) = await SingleCardDeckAsync(user);

        var noToken = await user.RawAsync(HttpMethod.Post, "/api/study/submit", $"{{\"cardId\":{card.Id},\"isCorrect\":true}}");
        var badCard = await user.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = 0, IsCorrect = true, AnswerToken = "x" });
        var longAnswer = await user.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = card.Id, IsCorrect = true, AnswerToken = "x", TypedAnswer = new string('a', 101) });

        foreach (var response in new[] { noToken, badCard, longAnswer })
        {
            await response.AssertStatusAsync(HttpStatusCode.BadRequest);
            Assert.Equal("A megadott adatok hiányosak vagy érvénytelenek.", await response.ProblemTitleAsync());
        }
    }

    [Fact]
    public async Task Submit_OthersOrUnknownCard_Returns404()
    {
        var owner = await EasyUserAsync();
        var intruder = await EasyUserAsync();
        var (_, card) = await SingleCardDeckAsync(owner);
        var token = (await owner.NextAsync()).AnswerToken!;

        await (await intruder.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = card.Id, IsCorrect = true, AnswerToken = token }))
            .AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = 99999999, IsCorrect = true, AnswerToken = token }))
            .AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Submit_TypedAnswerMatchingAnotherTerm_RecordsAConfusion()
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var cat = await user.CreateCardAsync(deck.Id, "cat", "small pet");
        await user.CreateCardAsync(deck.Id, "Dog", "loyal pet");

        var response = await SubmitSpecificAsync(user, cat.Id, false, typed: "  dOG ");

        var progress = await response.ReadAsync<CardProgressDto>();
        Assert.Equal("Dog", progress.ConfusedWithTerm);
        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        var confusion = Assert.Single(stats.Confusions);
        Assert.Equal(("cat", "Dog", 1), (confusion.Term, confusion.ConfusedWithTerm, confusion.Count));
    }

    [Fact]
    public async Task Submit_RepeatedConfusionIncrementsTheCounter()
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var cat = await user.CreateCardAsync(deck.Id, "cat", "small pet");
        await user.CreateCardAsync(deck.Id, "dog", "loyal pet");

        await SubmitSpecificAsync(user, cat.Id, false, "dog");
        await SubmitSpecificAsync(user, cat.Id, false, "dog");

        Assert.Equal(2, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Confusions.Single().Count);
    }

    [Theory]
    [InlineData("nonexistent")]
    [InlineData("cat")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task Submit_TypedAnswerWithoutADifferentMatchingTerm_RecordsNoConfusion(string? typed)
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var cat = await user.CreateCardAsync(deck.Id, "cat", "small pet");
        await user.CreateCardAsync(deck.Id, "dog", "loyal pet");

        var progress = await (await SubmitSpecificAsync(user, cat.Id, false, typed)).ReadAsync<CardProgressDto>();

        Assert.Null(progress.ConfusedWithTerm);
        Assert.Empty((await user.GetAsync<StudyStatsDto>("/api/study/stats")).Confusions);
    }

    [Fact]
    public async Task Submit_ConfusionIsOnlyRecordedForWrongAnswers_AndOnlyAmongOwnCards()
    {
        var user = await EasyUserAsync();
        var other = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var cat = await user.CreateCardAsync(deck.Id, "cat", "small pet");
        await user.CreateCardAsync(deck.Id, "dog", "loyal pet");
        await other.CreateCardAsync((await other.DefaultDeckAsync()).Id, "parrot", "talking bird");

        var correct = await (await SubmitSpecificAsync(user, cat.Id, true, "dog")).ReadAsync<CardProgressDto>();
        await factory.MakeCardDueAsync(cat.Id);
        var foreign = await (await SubmitSpecificAsync(user, cat.Id, false, "parrot")).ReadAsync<CardProgressDto>();

        Assert.Null(correct.ConfusedWithTerm);
        Assert.Null(foreign.ConfusedWithTerm);
    }

    // ---- napi sorozat és statisztika ----

    [Fact]
    public async Task Stats_AfterTheFirstAnswerTheStudyDayStreakIsOne()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);
        Assert.Equal(0, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).StudyDayStreak);

        await user.SubmitAsync(await user.NextAsync(), isCorrect: true);

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.Equal(1, stats.StudyDayStreak);
        Assert.Equal(1, stats.LongestStudyDayStreak);
        Assert.Equal(1, (await user.GetAsync<ProfileDto>("/api/auth/profile")).StudyDayStreak);
    }

    [Fact]
    public async Task Stats_SecondAnswerOnTheSameDayDoesNotIncreaseTheStreak()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);

        await user.SubmitAsync(await user.NextAsync(), isCorrect: false);
        await user.SubmitAsync(await user.NextAsync(), isCorrect: false);

        Assert.Equal(1, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).StudyDayStreak);
    }

    [Fact]
    public async Task Stats_StreakContinuesFromYesterdayAndRestartsAfterAGap()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);
        var timeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Budapest");
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timeZone).Date;

        await factory.WithDbAsync(db => db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(set => set
            .SetProperty(u => u.StudyDayStreak, 5)
            .SetProperty(u => u.LongestStudyDayStreak, 5)
            .SetProperty(u => u.LastStudyDate, today.AddDays(-1))));
        await user.SubmitAsync(await user.NextAsync(), isCorrect: false);
        Assert.Equal(6, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).StudyDayStreak);
        Assert.Equal(6, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).LongestStudyDayStreak);

        await factory.WithDbAsync(db => db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(set => set
            .SetProperty(u => u.LastStudyDate, today.AddDays(-3))));
        Assert.Equal(0, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).StudyDayStreak);

        await user.SubmitAsync(await user.NextAsync(), isCorrect: false);
        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.Equal(1, stats.StudyDayStreak);
        Assert.Equal(6, stats.LongestStudyDayStreak);
    }

    [Fact]
    public async Task Stats_EmptyAccount_HasZeroCountsAndFullWindows()
    {
        var user = await factory.RegisterUserAsync();

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");

        Assert.Equal(0, stats.TotalCards);
        Assert.Equal(0, stats.DueCards);
        Assert.Equal(0, stats.LearnedCards);
        Assert.Equal(0, stats.TotalIncorrect);
        Assert.Equal(0, stats.StudyDayStreak);
        Assert.Equal(0, stats.AiCallCount);
        Assert.Equal(30, stats.Days.Count);
        Assert.Equal(12, stats.Weeks.Count);
        Assert.Equal(30, stats.Forecast.Count);
        Assert.Equal(91, stats.Activity.Count);
        Assert.Equal(12, stats.Practice.Weeks.Count);
        Assert.Null(stats.Retention.Rate);
        Assert.Empty(stats.Cards);
        Assert.Empty(stats.Confusions);
        Assert.Empty(stats.Decks); // a paklilista a kártyákból épül, az üres pakli nem szerepel
        Assert.Equal(20, stats.Today.DailyNewCardGoal);
    }

    [Fact]
    public async Task Stats_CountsAnswersRetentionAndTodayActivity()
    {
        var user = await EasyUserAsync();
        var deck = await user.CreateDeckAsync();
        var a = await user.CreateCardAsync(deck.Id, "a", "d");
        var b = await user.CreateCardAsync(deck.Id, "b", "d");
        await SubmitSpecificAsync(user, a.Id, true);
        await SubmitSpecificAsync(user, b.Id, false);

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");

        Assert.Equal(2, stats.TotalCards);
        Assert.Equal(1, stats.TotalIncorrect);
        Assert.Equal(2, stats.Today.AnswerCount);
        Assert.Equal(1, stats.Today.CorrectCount);
        Assert.Equal(2, stats.Today.NewCardsIntroduced);
        Assert.Equal(2, stats.Retention.AnswerCount);
        Assert.Equal(1, stats.Retention.CorrectCount);
        Assert.Equal(0.5, stats.Retention.Rate);
        Assert.Equal(2, stats.Activity[^1].AnswerCount);
        Assert.Equal(1, stats.Activity[^1].CorrectCount);
        Assert.Equal(1, stats.DueCards); // csak a hibás kártya azonnal esedékes
        var row = stats.Cards.Single(c => c.Term == "b");
        Assert.Equal(1.0, row.ErrorRate);
        Assert.False(row.IsNew);
    }

    [Fact]
    public async Task Stats_MaturityBucketsFollowTheInterval()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var cards = await user.CreateCardsAsync(deck.Id, 5, "m");
        // 0: új · 1: tanulás (1 nap) · 2: fiatal (7 nap) · 3: érett (21 nap) · 4: felfüggesztett
        await factory.WithDbAsync(async db =>
        {
            var now = DateTime.UtcNow;
            async Task Set(int cardId, int interval)
            {
                await db.CardProgresses.Where(p => p.CardId == cardId).ExecuteUpdateAsync(set => set
                    .SetProperty(p => p.FirstReviewedAt, now.AddDays(-1))
                    .SetProperty(p => p.Interval, interval)
                    .SetProperty(p => p.NextReviewDate, now.AddDays(interval)));
            }

            await Set(cards[1].Id, 1);
            await Set(cards[2].Id, 7);
            await Set(cards[3].Id, 21);
        });
        await user.PutJsonAsync($"/api/cards/{cards[4].Id}/suspension", new SetCardSuspensionDto { Mode = "suspended" });

        var maturity = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Maturity;

        Assert.Equal((1, 1, 1, 1, 1), (maturity.New, maturity.Learning, maturity.Young, maturity.Mature, maturity.Suspended));
    }

    [Fact]
    public async Task Stats_ForecastPlacesCardsOnTheirDueDay()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var cards = await user.CreateCardsAsync(deck.Id, 3, "f");
        await factory.WithDbAsync(async db =>
        {
            var now = DateTime.UtcNow;
            foreach (var (card, days) in new[] { (cards[0], -2), (cards[1], 3), (cards[2], 400) })
            {
                await db.CardProgresses.Where(p => p.CardId == card.Id).ExecuteUpdateAsync(set => set
                    .SetProperty(p => p.FirstReviewedAt, now.AddDays(-5))
                    .SetProperty(p => p.NextReviewDate, now.AddDays(days)));
            }
        });

        var forecast = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Forecast;

        Assert.Equal(1, forecast[0].DueCount); // a lejárt a mai napra számít
        Assert.True(forecast[3].DueCount == 1 || forecast[2].DueCount == 1 || forecast[4].DueCount == 1);
        Assert.Equal(2, forecast.Sum(day => day.DueCount)); // a 400 napra lévő kívül esik az ablakon
    }

    [Fact]
    public async Task Stats_DeckBreakdownListsEveryDeckSortedByName()
    {
        var user = await factory.RegisterUserAsync();
        var beta = await user.CreateDeckAsync("Beta-" + Guid.NewGuid().ToString("N")[..6]);
        var alpha = await user.CreateDeckAsync("Alpha-" + Guid.NewGuid().ToString("N")[..6]);
        await user.CreateCardsAsync(alpha.Id, 2);
        await user.CreateCardsAsync(beta.Id, 1);

        var decks = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Decks;

        Assert.Equal(["Alpha", "Beta"], decks.Where(d => d.Name != "Saját pakli").Select(d => d.Name[..d.Name.IndexOf('-')]));
        Assert.Equal(2, decks.Single(d => d.DeckId == alpha.Id).TotalCards);
    }

    [Fact]
    public async Task Stats_AreIsolatedBetweenUsers()
    {
        var busy = await EasyUserAsync();
        var idle = await factory.RegisterUserAsync();
        await SingleCardDeckAsync(busy);
        await busy.SubmitAsync(await busy.NextAsync(), isCorrect: false);

        var stats = await idle.GetAsync<StudyStatsDto>("/api/study/stats");

        Assert.Equal(0, stats.TotalCards);
        Assert.Equal(0, stats.TotalIncorrect);
        Assert.Equal(0, stats.Today.AnswerCount);
    }

    // ---- beállítások ----

    [Fact]
    public async Task Settings_NewAccountHasTheDocumentedDefaults()
    {
        var user = await factory.RegisterUserAsync();

        var settings = await user.GetSettingsAsync();

        Assert.Equal(20, settings.DailyNewCardGoal);
        Assert.Equal(0, settings.MinimumAnswerSeconds);
        Assert.True(settings.AutomaticAiCheck);
        Assert.False(settings.AcceptHungarianParaphrase);
        Assert.True(settings.AcceptPartialMeaningMatch);
        Assert.False(settings.AcceptEnglishSynonyms);
        Assert.True(settings.RepeatMistakes);
        Assert.True(settings.RequireAppealReason);
        Assert.True(settings.ReuseSavedExamples);
        Assert.Equal("exact", settings.SavedLevelPolicy);
        Assert.True(settings.GenerateAlternateDefinitions);
        Assert.Equal(6, settings.LeechThreshold);
        Assert.Equal("B1", settings.ExampleLevel);
        Assert.Equal("Europe/Budapest", settings.TimeZoneId);
        Assert.Equal(5, settings.AiFillBatchSize);
        Assert.Equal(100, settings.AiFillDailyLimit);
        Assert.Equal(100, settings.AiFillRemainingToday);
        Assert.Contains(VocabApp.Api.Models.AiModels.All, m => m.Id == settings.AiModel);
    }

    [Fact]
    public async Task Settings_SaveRoundTripsEveryField()
    {
        var user = await factory.RegisterUserAsync();

        var saved = await user.SaveSettingsAsync(s =>
        {
            s.DailyNewCardGoal = 33;
            s.MinimumAnswerSeconds = 4;
            s.AutomaticAiCheck = false;
            s.AcceptHungarianParaphrase = true;
            s.AcceptPartialMeaningMatch = false;
            s.AcceptEnglishSynonyms = true;
            s.RepeatMistakes = false;
            s.RequireAppealReason = false;
            s.ReuseSavedExamples = false;
            s.SavedLevelPolicy = "noHarder";
            s.GenerateAlternateDefinitions = false;
            s.LeechThreshold = 9;
            s.ExampleLevel = "C1";
            s.AiModel = VocabApp.Api.Models.AiModels.All[^1].Id;
            s.TimeZoneId = "America/New_York";
            s.AiFillBatchSize = 8;
        });

        var reloaded = await user.GetSettingsAsync();
        foreach (var settings in new[] { saved, reloaded })
        {
            Assert.Equal(33, settings.DailyNewCardGoal);
            Assert.Equal(4, settings.MinimumAnswerSeconds);
            Assert.False(settings.AutomaticAiCheck);
            Assert.True(settings.AcceptHungarianParaphrase);
            Assert.False(settings.AcceptPartialMeaningMatch);
            Assert.True(settings.AcceptEnglishSynonyms);
            Assert.False(settings.RepeatMistakes);
            Assert.False(settings.RequireAppealReason);
            Assert.False(settings.ReuseSavedExamples);
            Assert.Equal("noHarder", settings.SavedLevelPolicy);
            Assert.False(settings.GenerateAlternateDefinitions);
            Assert.Equal(9, settings.LeechThreshold);
            Assert.Equal("C1", settings.ExampleLevel);
            Assert.Equal(VocabApp.Api.Models.AiModels.All[^1].Id, settings.AiModel);
            Assert.Equal("America/New_York", settings.TimeZoneId);
            Assert.Equal(8, settings.AiFillBatchSize);
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("Nincs/Ilyen")]
    public async Task Settings_UnknownTimeZoneFallsBackToBudapest(string zone)
    {
        var user = await factory.RegisterUserAsync();

        var saved = await user.SaveSettingsAsync(s => s.TimeZoneId = zone);

        Assert.Equal("Europe/Budapest", saved.TimeZoneId);
    }

    [Fact]
    public async Task Settings_BoundaryValuesAreAccepted()
    {
        var user = await factory.RegisterUserAsync();

        var low = await user.SaveSettingsAsync(s =>
        {
            s.DailyNewCardGoal = 0;
            s.MinimumAnswerSeconds = 0;
            s.LeechThreshold = 2;
            s.AiFillBatchSize = 1;
        });
        var high = await user.SaveSettingsAsync(s =>
        {
            s.DailyNewCardGoal = 100;
            s.MinimumAnswerSeconds = 120;
            s.LeechThreshold = 50;
            s.AiFillBatchSize = 10;
        });

        Assert.Equal((0, 0, 2, 1), (low.DailyNewCardGoal, low.MinimumAnswerSeconds, low.LeechThreshold, low.AiFillBatchSize));
        Assert.Equal((100, 120, 50, 10), (high.DailyNewCardGoal, high.MinimumAnswerSeconds, high.LeechThreshold, high.AiFillBatchSize));
    }

    [Theory]
    [InlineData("dailyNewCardGoal", -1)]
    [InlineData("dailyNewCardGoal", 101)]
    [InlineData("minimumAnswerSeconds", -1)]
    [InlineData("minimumAnswerSeconds", 121)]
    [InlineData("leechThreshold", 1)]
    [InlineData("leechThreshold", 51)]
    [InlineData("aiFillBatchSize", 0)]
    [InlineData("aiFillBatchSize", 11)]
    public async Task Settings_NumbersOutOfRange_Return400AndChangeNothing(string field, int value)
    {
        var user = await factory.RegisterUserAsync();
        var before = await user.GetSettingsAsync();
        var json = JsonSerializer.SerializeToNode(before, new JsonSerializerOptions(JsonSerializerDefaults.Web))!.AsObject();
        json[field] = value;

        var response = await user.RawAsync(HttpMethod.Put, "/api/study/settings", json.ToJsonString());

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        var after = await user.GetSettingsAsync();
        Assert.Equal(before.DailyNewCardGoal, after.DailyNewCardGoal);
        Assert.Equal(before.LeechThreshold, after.LeechThreshold);
    }

    [Fact]
    public async Task Settings_InvalidChoices_Return400WithHungarianMessages()
    {
        var user = await factory.RegisterUserAsync();

        var level = await Save(user, s => s.ExampleLevel = "D9");
        var model = await Save(user, s => s.AiModel = "made-up/model");
        var policy = await Save(user, s => s.SavedLevelPolicy = "sometimes");

        await level.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("A mondatszint érvénytelen.", await level.ProblemTitleAsync());
        await model.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Az MI-modell érvénytelen.", await model.ProblemTitleAsync());
        await policy.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("A mentett szintek szabálya érvénytelen.", await policy.ProblemTitleAsync());

        static async Task<HttpResponseMessage> Save(TestUser user, Action<StudySettingsDto> change)
        {
            var settings = await user.GetSettingsAsync();
            change(settings);
            return await user.PutJsonAsync("/api/study/settings", settings);
        }
    }

    [Fact]
    public async Task Settings_MissingRequiredStrings_Return400()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.RawAsync(HttpMethod.Put, "/api/study/settings", "{\"dailyNewCardGoal\":5}");

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Settings_PutIsAFullReplacement_OmittedBooleansTakeTheirCSharpDefaults()
    {
        // Ismert csapda (AGENTS.md): a hiányos PUT-törzs csendben átbillent beállításokat.
        var user = await factory.RegisterUserAsync();
        var model = (await user.GetSettingsAsync()).AiModel;

        var response = await user.RawAsync(
            HttpMethod.Put,
            "/api/study/settings",
            $"{{\"exampleLevel\":\"B1\",\"aiModel\":\"{model}\",\"savedLevelPolicy\":\"exact\"}}");

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var settings = await user.GetSettingsAsync();
        Assert.False(settings.AutomaticAiCheck);
        Assert.False(settings.RepeatMistakes);
        Assert.True(settings.AcceptPartialMeaningMatch);
        Assert.True(settings.RequireAppealReason);
        Assert.Equal(0, settings.DailyNewCardGoal);
    }

    [Fact]
    public async Task Settings_ReadOnlyAiFillFieldsAreIgnoredWhenSaving()
    {
        var user = await factory.RegisterUserAsync();

        var saved = await user.SaveSettingsAsync(s =>
        {
            s.AiFillDailyLimit = 1;
            s.AiFillRemainingToday = 999;
        });

        Assert.Equal(100, saved.AiFillDailyLimit);
        Assert.Equal(100, saved.AiFillRemainingToday);
    }

    [Fact]
    public async Task Settings_AreIndependentPerUser()
    {
        var first = await factory.RegisterUserAsync();
        var second = await factory.RegisterUserAsync();

        await first.SaveSettingsAsync(s => s.DailyNewCardGoal = 77);

        Assert.Equal(20, (await second.GetSettingsAsync()).DailyNewCardGoal);
    }

    [Fact]
    public async Task AutomaticAiCheck_CanBeToggledOnItsOwn_WithoutTouchingOtherSettings()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s => s.DailyNewCardGoal = 42);

        var off = await user.PutJsonAsync("/api/study/settings/automatic-ai-check", new AutomaticAiCheckDto { Enabled = false });
        await off.AssertStatusAsync(HttpStatusCode.OK);
        Assert.False((await off.ReadAsync<AutomaticAiCheckDto>()).Enabled);
        var settings = await user.GetSettingsAsync();
        Assert.False(settings.AutomaticAiCheck);
        Assert.Equal(42, settings.DailyNewCardGoal);

        var on = await user.PutJsonAsync("/api/study/settings/automatic-ai-check", new AutomaticAiCheckDto { Enabled = true });
        Assert.True((await on.ReadAsync<AutomaticAiCheckDto>()).Enabled);
        Assert.True((await user.GetSettingsAsync()).AutomaticAiCheck);
    }

    [Fact]
    public async Task Settings_TimeZoneChangesTheBoundaryOfTheStudyDay()
    {
        var user = await EasyUserAsync();
        await SingleCardDeckAsync(user);

        await user.SaveSettingsAsync(s => s.TimeZoneId = "Pacific/Kiritimati"); // UTC+14
        await user.SubmitAsync(await user.NextAsync(), isCorrect: false);
        var kiritimatiDate = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Pacific/Kiritimati")).Date;

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");

        Assert.Equal(kiritimatiDate, stats.Activity[^1].Date);
        Assert.Equal(1, stats.Activity[^1].AnswerCount);
    }

    // ---- hitelesítés ----

    [Theory]
    [InlineData("GET", "/api/study/stats")]
    [InlineData("GET", "/api/study/settings")]
    [InlineData("PUT", "/api/study/settings")]
    [InlineData("PUT", "/api/study/settings/automatic-ai-check")]
    [InlineData("GET", "/api/study/next")]
    [InlineData("POST", "/api/study/submit")]
    [InlineData("GET", "/api/free-study/cards")]
    [InlineData("PUT", "/api/free-study/cards/1/mark")]
    [InlineData("DELETE", "/api/free-study/cards/1/mark")]
    [InlineData("DELETE", "/api/free-study/marks")]
    [InlineData("GET", "/api/grammar/tenses")]
    [InlineData("PUT", "/api/grammar/tenses")]
    [InlineData("GET", "/api/grammar/translation")]
    [InlineData("PUT", "/api/grammar/translation")]
    [InlineData("PUT", "/api/grammar/attempts/1/accept")]
    [InlineData("PUT", "/api/composition/attempts/1/accept")]
    public async Task EveryStudyEndpoint_RequiresLogin(string method, string url)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method is "POST" or "PUT")
        {
            request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
        }

        await (await factory.CreateAnonymousClient().SendAsync(request)).AssertStatusAsync(HttpStatusCode.Unauthorized);
    }
}
