using System.Net;
using System.Net.Http.Json;
using VocabApp.Api.DTOs;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

/// <summary>Kártyázás (free-study), Nyelvtan és Mondatok nézet: a szerver oldali részük.</summary>
[Collection(ApiCollection.Name)]
public class PracticeModesApiTests(ApiFactory factory)
{
    private static async Task<List<FreeStudyCardDto>> FreeCardsAsync(TestUser user, string query = "") =>
        await user.GetAsync<List<FreeStudyCardDto>>("/api/free-study/cards" + query);

    // ---- Kártyázás ----

    [Fact]
    public async Task FreeStudy_ListsAllOwnCardsWithoutMarksInCreationOrder()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        await user.CreateCardAsync(deck.Id, "b", "second", "ex", "második", "tag1");
        await user.CreateCardAsync(deck.Id, "a", "first");

        var cards = await FreeCardsAsync(user);

        Assert.Equal(["b", "a"], cards.Select(c => c.Term));
        Assert.All(cards, c => Assert.Null(c.Knows));
        Assert.Equal(("second", "ex", "második", "tag1"), (cards[0].Definition, cards[0].Example, cards[0].TargetMeanings, cards[0].Tags));
    }

    [Fact]
    public async Task FreeStudy_DeckFilterAndForeignDeck()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var other = await owner.CreateDeckAsync();
        var mine = await owner.DefaultDeckAsync();
        await owner.CreateCardAsync(mine.Id, "in-default");
        await owner.CreateCardAsync(other.Id, "in-other");

        Assert.Equal(["in-other"], (await FreeCardsAsync(owner, $"?deckId={other.Id}")).Select(c => c.Term));
        await (await intruder.Client.GetAsync($"/api/free-study/cards?deckId={other.Id}")).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(await FreeCardsAsync(intruder));
    }

    [Fact]
    public async Task FreeStudy_TagFilter()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        await user.CreateCardAsync(deck.Id, "tagged", "d", tags: "food");
        await user.CreateCardAsync(deck.Id, "untagged", "d");

        Assert.Equal(["tagged"], (await FreeCardsAsync(user, "?tag=FOOD")).Select(c => c.Term));
    }

    [Fact]
    public async Task FreeStudy_FocusFilters()
    {
        var user = await factory.RegisterUserAsync();
        await user.MakeStudyEasyAsync();
        var deck = await user.DefaultDeckAsync();
        var fresh = await user.CreateCardAsync(deck.Id, "fresh", "d");
        var wrong = await user.CreateCardAsync(deck.Id, "wrong", "d");
        var right = await user.CreateCardAsync(deck.Id, "right", "d");
        await AnswerAsync(user, wrong.Id, isCorrect: false);
        await AnswerAsync(user, right.Id, isCorrect: true);

        Assert.Equal(["fresh"], (await FreeCardsAsync(user, "?focus=new")).Select(c => c.Term));
        Assert.Equal(["wrong"], (await FreeCardsAsync(user, "?focus=mistakes")).Select(c => c.Term));
        Assert.Equal(["wrong"], (await FreeCardsAsync(user, "?focus=due")).Select(c => c.Term));
        Assert.Equal(["wrong", "right"], (await FreeCardsAsync(user, "?focus=reviewed")).Select(c => c.Term));
        Assert.Equal(3, (await FreeCardsAsync(user, "?focus=all")).Count);
        Assert.Equal(3, (await FreeCardsAsync(user, "?focus=bogus")).Count);
        Assert.Contains(fresh.Id, (await FreeCardsAsync(user)).Select(c => c.Id));

        await factory.MakeCardDueAsync(right.Id);
        Assert.Equal(["wrong", "right"], (await FreeCardsAsync(user, "?focus=due")).Select(c => c.Term));
    }

    [Fact]
    public async Task FreeStudy_SuspendedCardsAreHidden()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        await user.CreateCardAsync(deck.Id, "visible", "d");
        var hidden = await user.CreateCardAsync(deck.Id, "hidden", "d");
        await user.PutJsonAsync($"/api/cards/{hidden.Id}/suspension", new SetCardSuspensionDto { Mode = "suspended" });

        Assert.Equal(["visible"], (await FreeCardsAsync(user)).Select(c => c.Term));
    }

    [Fact]
    public async Task FreeStudy_MarkingDoesNotTouchTheSpacedRepetitionProgress()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        (await user.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true })).EnsureSuccessStatusCode();

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.True(stats.Cards.Single().IsNew);
        Assert.Equal(0, stats.Today.AnswerCount);
    }

    [Fact]
    public async Task FreeStudy_MarkSetsAndUpdatesKnowledge()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        await (await user.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true })).AssertStatusAsync(HttpStatusCode.NoContent);
        Assert.True((await FreeCardsAsync(user)).Single().Knows);

        await user.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = false });
        Assert.False((await FreeCardsAsync(user)).Single().Knows);
    }

    [Fact]
    public async Task FreeStudy_MarksArePerUser()
    {
        var first = await factory.RegisterUserAsync();
        var second = await factory.RegisterUserAsync();
        var card = await first.CreateCardAsync((await first.DefaultDeckAsync()).Id, "dog");
        await first.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true });

        await (await second.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true })).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.True((await FreeCardsAsync(first)).Single().Knows);
    }

    [Fact]
    public async Task FreeStudy_MarkWithoutValue_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        var response = await user.RawAsync(HttpMethod.Put, $"/api/free-study/cards/{card.Id}/mark", "{}");

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task FreeStudy_MarkUnknownCard_Returns404()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.PutJsonAsync("/api/free-study/cards/99999999/mark", new MarkFreeStudyDto { Knows = true })).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task FreeStudy_ClearMark_RemovesItAndIsIdempotent()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        await user.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true });

        await (await user.Client.DeleteAsync($"/api/free-study/cards/{card.Id}/mark")).AssertStatusAsync(HttpStatusCode.NoContent);
        await (await user.Client.DeleteAsync($"/api/free-study/cards/{card.Id}/mark")).AssertStatusAsync(HttpStatusCode.NoContent);
        await (await user.Client.DeleteAsync("/api/free-study/cards/99999999/mark")).AssertStatusAsync(HttpStatusCode.NoContent);

        Assert.Null((await FreeCardsAsync(user)).Single().Knows);
    }

    [Fact]
    public async Task FreeStudy_ClearMark_DoesNotRemoveAnotherUsersMark()
    {
        var owner = await factory.RegisterUserAsync();
        var other = await factory.RegisterUserAsync();
        var card = await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, "dog");
        await owner.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true });

        await other.Client.DeleteAsync($"/api/free-study/cards/{card.Id}/mark");

        Assert.True((await FreeCardsAsync(owner)).Single().Knows);
    }

    [Fact]
    public async Task FreeStudy_ClearMarks_OnlyAffectsTheFilteredCards()
    {
        var user = await factory.RegisterUserAsync();
        var deckA = await user.CreateDeckAsync();
        var deckB = await user.CreateDeckAsync();
        var a = await user.CreateCardAsync(deckA.Id, "a", "d", tags: "x");
        var a2 = await user.CreateCardAsync(deckA.Id, "a2", "d");
        var b = await user.CreateCardAsync(deckB.Id, "b", "d", tags: "x");
        foreach (var card in new[] { a, a2, b })
        {
            await user.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true });
        }

        // csak az A pakli x címkés kártyájának jelölése törlődik
        await (await user.Client.DeleteAsync($"/api/free-study/marks?deckId={deckA.Id}&tag=x")).AssertStatusAsync(HttpStatusCode.NoContent);

        var marks = (await FreeCardsAsync(user)).ToDictionary(c => c.Term, c => c.Knows);
        Assert.Null(marks["a"]);
        Assert.True(marks["a2"]);
        Assert.True(marks["b"]);

        // szűrő nélkül minden jelölés törlődik
        await user.Client.DeleteAsync("/api/free-study/marks");
        Assert.All(await FreeCardsAsync(user), c => Assert.Null(c.Knows));
    }

    [Fact]
    public async Task FreeStudy_ClearMarks_ForeignDeckReturns404_AndOtherUsersMarksSurvive()
    {
        var owner = await factory.RegisterUserAsync();
        var other = await factory.RegisterUserAsync();
        var deck = await owner.DefaultDeckAsync();
        var card = await owner.CreateCardAsync(deck.Id, "dog");
        await owner.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true });

        await (await other.Client.DeleteAsync($"/api/free-study/marks?deckId={deck.Id}")).AssertStatusAsync(HttpStatusCode.NotFound);
        await other.Client.DeleteAsync("/api/free-study/marks");

        Assert.True((await FreeCardsAsync(owner)).Single().Knows);
    }

    [Fact]
    public async Task FreeStudy_ClearMarks_SuspendedCardsKeepTheirMarks()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "dog");
        await user.PutJsonAsync($"/api/free-study/cards/{card.Id}/mark", new MarkFreeStudyDto { Knows = true });
        await user.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = "suspended" });

        await user.Client.DeleteAsync("/api/free-study/marks");
        await user.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = "none" });

        Assert.True((await FreeCardsAsync(user)).Single().Knows);
    }

    private static async Task AnswerAsync(TestUser user, int cardId, bool isCorrect)
    {
        for (var i = 0; i < 300; i++)
        {
            var next = await user.NextAsync();
            if (next.Card?.Id == cardId)
            {
                (await user.SubmitAsync(next, isCorrect)).EnsureSuccessStatusCode();
                return;
            }
        }

        throw new InvalidOperationException("A kártya nem jött fel.");
    }

    // ---- Nyelvtan ----

    [Fact]
    public async Task Grammar_TensesDefaultToPresentAndPastSimple()
    {
        var user = await factory.RegisterUserAsync();

        var tenses = await user.GetAsync<GrammarTensesDto>("/api/grammar/tenses");

        Assert.Equal(["present_simple", "past_simple"], tenses.Tenses);
    }

    [Fact]
    public async Task Grammar_SetTenses_StoresCanonicalOrderWithoutDuplicates()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync("/api/grammar/tenses", new GrammarTensesDto { Tenses = ["future_simple", "present_perfect", "future_simple", "past_simple"] });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var expected = new[] { "present_perfect", "past_simple", "future_simple" };
        Assert.Equal(expected, (await response.ReadAsync<GrammarTensesDto>()).Tenses);
        Assert.Equal(expected, (await user.GetAsync<GrammarTensesDto>("/api/grammar/tenses")).Tenses);
    }

    [Fact]
    public async Task Grammar_SetTenses_AllThirteenAreAccepted()
    {
        var user = await factory.RegisterUserAsync();
        string[] all =
        [
            "present_simple", "present_continuous", "present_perfect", "present_perfect_continuous",
            "past_simple", "past_continuous", "past_perfect", "past_perfect_continuous",
            "future_simple", "going_to", "future_continuous", "future_perfect", "future_perfect_continuous"
        ];

        var response = await user.PutJsonAsync("/api/grammar/tenses", new GrammarTensesDto { Tenses = [.. all.Reverse()] });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal(all, (await response.ReadAsync<GrammarTensesDto>()).Tenses);
    }

    [Fact]
    public async Task Grammar_SetTenses_UnknownTenseIsRejectedAndNothingChanges()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync("/api/grammar/tenses", new GrammarTensesDto { Tenses = ["present_simple", "bogus_tense"] });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Ismeretlen igeidő.", await response.ProblemTitleAsync());
        Assert.Equal(["present_simple", "past_simple"], (await user.GetAsync<GrammarTensesDto>("/api/grammar/tenses")).Tenses);
    }

    [Fact]
    public async Task Grammar_SetTenses_EmptyListIsRejected()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync("/api/grammar/tenses", new GrammarTensesDto { Tenses = [] });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Legalább egy igeidőt válassz ki.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Grammar_SetTenses_MoreThanFiftyEntriesIsRejectedByValidation()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync("/api/grammar/tenses", new GrammarTensesDto { Tenses = Enumerable.Repeat("present_simple", 51).ToList() });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Grammar_TensesArePerUser()
    {
        var first = await factory.RegisterUserAsync();
        var second = await factory.RegisterUserAsync();

        await first.PutJsonAsync("/api/grammar/tenses", new GrammarTensesDto { Tenses = ["going_to"] });

        Assert.Equal(["present_simple", "past_simple"], (await second.GetAsync<GrammarTensesDto>("/api/grammar/tenses")).Tenses);
    }

    [Fact]
    public async Task Grammar_TranslationSettingDefaultsToOffAndCanBeToggled()
    {
        var user = await factory.RegisterUserAsync();
        Assert.False((await user.GetAsync<GrammarTranslationDto>("/api/grammar/translation")).Enabled);

        var on = await user.PutJsonAsync("/api/grammar/translation", new GrammarTranslationDto { Enabled = true });
        Assert.True((await on.ReadAsync<GrammarTranslationDto>()).Enabled);
        Assert.True((await user.GetAsync<GrammarTranslationDto>("/api/grammar/translation")).Enabled);

        await user.PutJsonAsync("/api/grammar/translation", new GrammarTranslationDto { Enabled = false });
        Assert.False((await user.GetAsync<GrammarTranslationDto>("/api/grammar/translation")).Enabled);
    }

    [Fact]
    public async Task Grammar_CheckSavesAnAttempt_AndItShowsUpInTheStats()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        factory.Ai.Reset();

        var response = await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = card.Id, Tense = "past_simple", Sentence = "The dog barked." });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<GrammarCheckResponseDto>();
        Assert.True(result.AttemptId > 0);
        var grammar = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar;
        Assert.Equal(1, grammar.AttemptCount);
        Assert.Equal(1, grammar.CorrectCount);
        var tense = Assert.Single(grammar.Tenses);
        Assert.Equal(("past_simple", 1, 1), (tense.Tense, tense.AttemptCount, tense.CorrectCount));
    }

    [Fact]
    public async Task Grammar_CheckDoesNotTouchTheSpacedRepetitionProgress()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        factory.Ai.Reset();

        await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = card.Id, Tense = "past_simple", Sentence = "x" });

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.True(stats.Cards.Single().IsNew);
        Assert.Equal(0, stats.Today.AnswerCount);
        Assert.Equal(0, stats.StudyDayStreak);
    }

    [Fact]
    public async Task Grammar_AcceptTurnsAWrongAttemptCorrectAndMarksItManuallyAccepted()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        factory.Ai.Reset();
        factory.Ai.RejectChecks = true;
        var attempt = await (await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = card.Id, Tense = "past_simple", Sentence = "x" }))
            .ReadAsync<GrammarCheckResponseDto>();
        factory.Ai.Reset();
        Assert.Equal(0, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.CorrectCount);

        await (await user.Client.PutAsync($"/api/grammar/attempts/{attempt.AttemptId}/accept", null)).AssertStatusAsync(HttpStatusCode.NoContent);

        var grammar = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar;
        Assert.Equal(1, grammar.CorrectCount);
        Assert.Equal(1, grammar.ManuallyAcceptedCount);
        // a kézzel elfogadott próbálkozás nem számít bele a hibatípusokba
        Assert.Equal(0, grammar.TermErrorCount);
        Assert.Equal(0, grammar.TenseErrorCount);
        Assert.Equal(0, grammar.GrammarErrorCount);
    }

    [Fact]
    public async Task Grammar_AcceptOnACorrectAttemptChangesNothing()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        factory.Ai.Reset();
        var attempt = await (await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = card.Id, Tense = "past_simple", Sentence = "x" }))
            .ReadAsync<GrammarCheckResponseDto>();

        await (await user.Client.PutAsync($"/api/grammar/attempts/{attempt.AttemptId}/accept", null)).AssertStatusAsync(HttpStatusCode.NoContent);

        Assert.Equal(0, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.ManuallyAcceptedCount);
    }

    [Fact]
    public async Task Grammar_AcceptForeignOrUnknownAttemptReturns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var card = await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, "dog");
        factory.Ai.Reset();
        factory.Ai.RejectChecks = true;
        var attempt = await (await owner.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = card.Id, Tense = "past_simple", Sentence = "x" }))
            .ReadAsync<GrammarCheckResponseDto>();
        factory.Ai.Reset();

        await (await intruder.Client.PutAsync($"/api/grammar/attempts/{attempt.AttemptId}/accept", null)).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.PutAsync("/api/grammar/attempts/99999999/accept", null)).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Equal(0, (await owner.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.CorrectCount);
    }

    // ---- Mondatok ----

    private static async Task<List<int>> ThreeCardIdsAsync(TestUser user)
    {
        var cards = await user.CreateCardsAsync((await user.DefaultDeckAsync()).Id, 3, "w");
        return cards.Select(c => c.Id).ToList();
    }

    [Fact]
    public async Task Composition_CheckSavesAnAttemptWithOneRowPerWord()
    {
        var user = await factory.RegisterUserAsync();
        var ids = await ThreeCardIdsAsync(user);
        factory.Ai.Reset();

        var response = await user.PostJsonAsync("/api/ai/composition/check", new CompositionCheckRequestDto { CardIds = ids, Text = "Some text." });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<CompositionCheckResponseDto>();
        Assert.True(result.AttemptId > 0);
        var composition = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Composition;
        Assert.Equal(1, composition.AttemptCount);
        Assert.Equal(1, composition.CorrectCount);
        Assert.Equal(3, composition.WordCount);
        Assert.Equal(3, composition.CorrectWordCount);
    }

    [Fact]
    public async Task Composition_AcceptTurnsAWrongAttemptCorrect_AndAllItsWordsCountAsCorrect()
    {
        var user = await factory.RegisterUserAsync();
        var ids = await ThreeCardIdsAsync(user);
        factory.Ai.Reset();
        factory.Ai.RejectChecks = true;
        var attempt = await (await user.PostJsonAsync("/api/ai/composition/check", new CompositionCheckRequestDto { CardIds = ids, Text = "x" }))
            .ReadAsync<CompositionCheckResponseDto>();
        factory.Ai.Reset();
        var before = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Composition;
        Assert.Equal((0, 0, 1), (before.CorrectCount, before.CorrectWordCount, before.WordErrorCount));

        await (await user.Client.PutAsync($"/api/composition/attempts/{attempt.AttemptId}/accept", null)).AssertStatusAsync(HttpStatusCode.NoContent);

        var after = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Composition;
        Assert.Equal(1, after.CorrectCount);
        Assert.Equal(1, after.ManuallyAcceptedCount);
        Assert.Equal(3, after.CorrectWordCount);
        Assert.Equal((0, 0, 0), (after.WordErrorCount, after.GrammarErrorCount, after.CoherenceErrorCount));
    }

    [Fact]
    public async Task Composition_AcceptForeignOrUnknownAttemptReturns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var ids = await ThreeCardIdsAsync(owner);
        factory.Ai.Reset();
        factory.Ai.RejectChecks = true;
        var attempt = await (await owner.PostJsonAsync("/api/ai/composition/check", new CompositionCheckRequestDto { CardIds = ids, Text = "x" }))
            .ReadAsync<CompositionCheckResponseDto>();
        factory.Ai.Reset();

        await (await intruder.Client.PutAsync($"/api/composition/attempts/{attempt.AttemptId}/accept", null)).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.PutAsync("/api/composition/attempts/99999999/accept", null)).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Practice_ProblemWordsListTheWordsUsedWronglyMostOften_ExcludingAcceptedAttempts()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var trouble = await user.CreateCardAsync(deck.Id, "trouble", "d");
        var fine = await user.CreateCardAsync(deck.Id, "fine", "d");
        factory.Ai.Reset();
        factory.Ai.RejectChecks = true;
        var accepted = await (await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = trouble.Id, Tense = "past_simple", Sentence = "x" }))
            .ReadAsync<GrammarCheckResponseDto>();
        await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = trouble.Id, Tense = "past_simple", Sentence = "y" });
        factory.Ai.Reset();
        await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = fine.Id, Tense = "past_simple", Sentence = "z" });
        await user.Client.PutAsync($"/api/grammar/attempts/{accepted.AttemptId}/accept", null);

        var words = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.ProblemWords;

        var word = Assert.Single(words);
        Assert.Equal(("trouble", 1, 1), (word.Term, word.UseCount, word.ErrorCount));
    }

    [Fact]
    public async Task Practice_AttemptsOfADeletedCardKeepTheirCountsButDropOutOfProblemWords()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "ghost");
        factory.Ai.Reset();
        factory.Ai.RejectChecks = true;
        await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = card.Id, Tense = "past_simple", Sentence = "x" });
        factory.Ai.Reset();

        await user.Client.DeleteAsync($"/api/cards/{card.Id}");

        var practice = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice;
        Assert.Equal(1, practice.Grammar.AttemptCount);
        Assert.Empty(practice.ProblemWords);
    }

    [Fact]
    public async Task Practice_WeeklyTrendCountsTheAttemptInTheCurrentWeek()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        factory.Ai.Reset();
        await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = card.Id, Tense = "past_simple", Sentence = "x" });

        var weeks = (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Weeks;

        Assert.Equal(12, weeks.Count);
        Assert.Equal(DayOfWeek.Monday, weeks[^1].WeekStart.DayOfWeek);
        Assert.Equal((1, 1), (weeks[^1].GrammarAttemptCount, weeks[^1].GrammarCorrectCount));
        Assert.All(weeks.Take(11), week => Assert.Equal(0, week.GrammarAttemptCount));
    }

    [Fact]
    public async Task DeletingTheAccountWithPracticeHistorySucceeds()
    {
        var user = await factory.RegisterUserAsync();
        var ids = await ThreeCardIdsAsync(user);
        factory.Ai.Reset();
        await user.PostJsonAsync("/api/ai/composition/check", new CompositionCheckRequestDto { CardIds = ids, Text = "x" });
        await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = ids[0], Tense = "past_simple", Sentence = "x" });

        await (await user.Client.DeleteAsync("/api/auth/account")).AssertStatusAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task DeletingADeckWithPracticeHistorySucceeds()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var cards = await user.CreateCardsAsync(deck.Id, 2);
        factory.Ai.Reset();
        await user.PostJsonAsync("/api/ai/composition/check", new CompositionCheckRequestDto { CardIds = cards.Select(c => c.Id).ToList(), Text = "x" });
        await user.PostJsonAsync("/api/ai/grammar/check", new GrammarCheckRequestDto { CardId = cards[0].Id, Tense = "past_simple", Sentence = "x" });

        await (await user.Client.DeleteAsync($"/api/decks/{deck.Id}")).AssertStatusAsync(HttpStatusCode.NoContent);

        Assert.Equal(1, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.AttemptCount);
    }
}
