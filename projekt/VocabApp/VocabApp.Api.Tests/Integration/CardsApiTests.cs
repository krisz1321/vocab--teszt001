using System.Net;
using VocabApp.Api.DTOs;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

[Collection(ApiCollection.Name)]
public class CardsApiTests(ApiFactory factory)
{
    private static CreateCardDto NewCard(int deckId, string term = "dog", string definition = "a domestic animal") =>
        new() { DeckId = deckId, Term = term, Definition = definition };

    // ---- létrehozás ----

    [Fact]
    public async Task Create_Valid_ReturnsNormalizedNewCard()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();

        var response = await user.PostJsonAsync("/api/cards", new CreateCardDto
        {
            DeckId = deck.Id,
            Term = "  dog ",
            Definition = " a domestic animal ",
            Example = "  The dog barks. ",
            TargetMeanings = " kutya ",
            Tags = "Animal ; PET, animal"
        });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var card = await response.ReadAsync<CardDto>();
        Assert.Equal("dog", card.Term);
        Assert.Equal("a domestic animal", card.Definition);
        Assert.Equal("The dog barks.", card.Example);
        Assert.Equal("kutya", card.TargetMeanings);
        Assert.Equal("animal,pet", card.Tags);
        Assert.Equal(deck.Id, card.DeckId);
        Assert.False(card.IsLearned);
        Assert.False(card.MarkedKnown);
        Assert.False(card.IsLeech);
        Assert.Equal("none", card.Suspension);
    }

    [Fact]
    public async Task Create_BlankOptionalFields_AreStoredAsNull()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();

        var card = await (await user.PostJsonAsync("/api/cards", new CreateCardDto
        {
            DeckId = deck.Id,
            Term = "cat",
            Definition = "small animal",
            Example = "   ",
            TargetMeanings = "",
            Tags = " , ; "
        })).ReadAsync<CardDto>();

        Assert.Null(card.Example);
        Assert.Null(card.TargetMeanings);
        Assert.Null(card.Tags);
    }

    [Theory]
    [InlineData(null, "def", "A szó megadása kötelező.")]
    [InlineData("  ", "def", "A szó megadása kötelező.")]
    [InlineData("term", null, "A definíció megadása kötelező.")]
    [InlineData("term", "   ", "A definíció megadása kötelező.")]
    public async Task Create_MissingRequiredText_Returns400(string? term, string? definition, string expectedTitle)
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();

        var response = await user.PostJsonAsync("/api/cards", new CreateCardDto { DeckId = deck.Id, Term = term, Definition = definition });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal(expectedTitle, await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Create_FieldLengthBoundaries()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();

        var max = await user.PostJsonAsync("/api/cards", new CreateCardDto
        {
            DeckId = deck.Id,
            Term = new string('t', 100),
            Definition = new string('d', 500),
            Example = new string('e', 500),
            TargetMeanings = new string('m', 300)
        });
        await max.AssertStatusAsync(HttpStatusCode.OK);

        foreach (var (field, change) in new (string, Action<CreateCardDto>)[]
                 {
                     ("szó", c => c.Term = new string('t', 101)),
                     ("definíció", c => c.Definition = new string('d', 501)),
                     ("példa", c => c.Example = new string('e', 501)),
                     ("célnyelvi jelentés", c => c.TargetMeanings = new string('m', 301))
                 })
        {
            var dto = NewCard(deck.Id);
            change(dto);
            var response = await user.PostJsonAsync("/api/cards", dto);
            await response.AssertStatusAsync(HttpStatusCode.BadRequest);
            Assert.Contains(field, await response.ProblemTitleAsync());
        }
    }

    [Fact]
    public async Task Create_TagLimits()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();

        var tooMany = NewCard(deck.Id);
        tooMany.Tags = "a,b,c,d,e,f";
        var tooLong = NewCard(deck.Id);
        tooLong.Tags = new string('x', 25);

        await (await user.PostJsonAsync("/api/cards", tooMany)).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await user.PostJsonAsync("/api/cards", tooLong)).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Create_InOthersOrUnknownDeck_Returns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var deck = await owner.DefaultDeckAsync();

        await (await intruder.PostJsonAsync("/api/cards", NewCard(deck.Id))).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.PostJsonAsync("/api/cards", NewCard(99999999))).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(await owner.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
    }

    [Fact]
    public async Task Create_AllowsDuplicateTermsInTheSameDeck()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();

        await user.CreateCardAsync(deck.Id, "bank", "a financial institution");
        await user.CreateCardAsync(deck.Id, "bank", "the side of a river");

        Assert.Equal(2, (await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}")).Count);
    }

    // ---- lekérdezés ----

    [Fact]
    public async Task ByDeck_ReturnsCardsInCreationOrder()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        await user.CreateCardsAsync(deck.Id, 3, "w");

        var terms = (await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}")).Select(c => c.Term);

        Assert.Equal(["w1", "w2", "w3"], terms);
    }

    [Fact]
    public async Task ByDeck_OthersOrUnknownDeck_Returns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var deck = await owner.DefaultDeckAsync();

        await (await intruder.Client.GetAsync($"/api/cards/by-deck/{deck.Id}")).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.GetAsync("/api/cards/by-deck/99999999")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    // ---- módosítás ----

    [Fact]
    public async Task Update_ReplacesAllFields()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "dog", "old", "old example", "kutya", "animal");

        var response = await user.PutJsonAsync($"/api/cards/{card.Id}", new UpdateCardDto
        {
            Term = " hound ",
            Definition = "new definition",
            Example = "A hound.",
            TargetMeanings = "vadászkutya",
            Tags = "Dog"
        });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var updated = await response.ReadAsync<CardDto>();
        Assert.Equal("hound", updated.Term);
        Assert.Equal("new definition", updated.Definition);
        Assert.Equal("A hound.", updated.Example);
        Assert.Equal("vadászkutya", updated.TargetMeanings);
        Assert.Equal("dog", updated.Tags);
        Assert.Equal(card.Id, updated.Id);
    }

    [Fact]
    public async Task Update_OmittedOptionalFieldsAreCleared()
    {
        // A PUT teljes csere: a hiányzó mező null-ra íródik (AGENTS.md, L-01), ezért a kliens mindig mindent küld.
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "dog", "def", "ex", "kutya", "animal");

        var updated = await (await user.PutJsonAsync($"/api/cards/{card.Id}", new UpdateCardDto { Term = "dog", Definition = "def" })).ReadAsync<CardDto>();

        Assert.Null(updated.Example);
        Assert.Null(updated.TargetMeanings);
        Assert.Null(updated.Tags);
    }

    [Fact]
    public async Task Update_KeepsStudyProgress()
    {
        var user = await factory.RegisterUserAsync();
        await user.MakeStudyEasyAsync();
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "dog");
        var next = await user.NextAsync();
        (await user.SubmitAsync(next, isCorrect: true)).EnsureSuccessStatusCode();

        await user.PutJsonAsync($"/api/cards/{card.Id}", new UpdateCardDto { Term = "dog", Definition = "changed" });

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.Equal(1, stats.Cards.Single(c => c.Term == "dog").Streak);
    }

    [Theory]
    [InlineData(null, "def")]
    [InlineData("term", null)]
    public async Task Update_MissingRequiredText_Returns400(string? term, string? definition)
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "dog");

        await (await user.PutJsonAsync($"/api/cards/{card.Id}", new UpdateCardDto { Term = term, Definition = definition }))
            .AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_OthersOrUnknownCard_Returns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var card = await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, "dog");

        await (await intruder.PutJsonAsync($"/api/cards/{card.Id}", new UpdateCardDto { Term = "x", Definition = "y" })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.PutJsonAsync("/api/cards/99999999", new UpdateCardDto { Term = "x", Definition = "y" })).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Equal("dog", (await owner.GetAsync<List<CardDto>>($"/api/cards/by-deck/{card.DeckId}")).Single().Term);
    }

    // ---- ismerem ----

    [Fact]
    public async Task SetKnown_MarksCardAsLearnedWithFifteenDayInterval()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        var response = await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var known = await response.ReadAsync<CardDto>();
        Assert.True(known.IsLearned);
        Assert.True(known.MarkedKnown);

        var learned = Assert.Single(await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned"));
        Assert.Equal(3, learned.Streak);
        Assert.Equal(15, learned.Interval);
        Assert.True(learned.MarkedKnown);
        Assert.NotNull(learned.FirstReviewedAt);
        Assert.InRange((learned.NextReviewDate - DateTime.UtcNow).TotalDays, 14.9, 15.1);
        Assert.Equal(DateTimeKind.Utc, learned.NextReviewDate.Kind);
    }

    [Fact]
    public async Task SetKnown_Twice_IsIdempotent()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true });
        var first = (await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned")).Single();

        await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true });

        var second = (await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned")).Single();
        Assert.Equal(first.LearnedAt, second.LearnedAt);
    }

    [Fact]
    public async Task SetKnownFalse_ReturnsCardToTheNewOnes()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");
        await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true });

        var undone = await (await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = false })).ReadAsync<CardDto>();

        Assert.False(undone.IsLearned);
        Assert.False(undone.MarkedKnown);
        Assert.Empty(await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned"));
        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.True(stats.Cards.Single().IsNew);
    }

    [Fact]
    public async Task SetKnown_OthersCard_Returns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var card = await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, "dog");

        await (await intruder.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true })).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(await owner.GetAsync<List<LearnedCardDto>>("/api/cards/learned"));
    }

    [Fact]
    public async Task ResetLearned_OnlyWorksOnLearnedCards()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        await (await user.Client.PostAsync($"/api/cards/{card.Id}/reset-learned", null)).AssertStatusAsync(HttpStatusCode.NotFound);

        await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true });
        await (await user.Client.PostAsync($"/api/cards/{card.Id}/reset-learned", null)).AssertStatusAsync(HttpStatusCode.NoContent);
        Assert.Empty(await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned"));
    }

    [Fact]
    public async Task ResetLearned_OthersCard_Returns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var card = await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, "dog");
        await owner.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true });

        await (await intruder.Client.PostAsync($"/api/cards/{card.Id}/reset-learned", null)).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Single(await owner.GetAsync<List<LearnedCardDto>>("/api/cards/learned"));
    }

    [Fact]
    public async Task Learned_ListsOnlyOwnLearnedCardsNewestFirst()
    {
        var user = await factory.RegisterUserAsync();
        var other = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var cards = await user.CreateCardsAsync(deck.Id, 3);
        var foreign = await other.CreateCardAsync((await other.DefaultDeckAsync()).Id, "foreign");
        await other.PutJsonAsync($"/api/cards/{foreign.Id}/known", new SetCardKnownDto { Known = true });
        await user.PutJsonAsync($"/api/cards/{cards[0].Id}/known", new SetCardKnownDto { Known = true });
        await Task.Delay(20);
        await user.PutJsonAsync($"/api/cards/{cards[2].Id}/known", new SetCardKnownDto { Known = true });

        var learned = await user.GetAsync<List<LearnedCardDto>>("/api/cards/learned");

        Assert.Equal(["word3", "word1"], learned.Select(c => c.Term));
        Assert.All(learned, c => Assert.Equal("Saját pakli", c.DeckName));
    }

    // ---- felfüggesztés ----

    [Fact]
    public async Task Suspension_SuspendedCardIsNotStudiedUntilRestored()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        var suspended = await (await user.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = "suspended" })).ReadAsync<CardDto>();
        Assert.Equal("suspended", suspended.Suspension);
        Assert.Equal("empty", (await user.NextAsync()).Status);

        var restored = await (await user.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = "none" })).ReadAsync<CardDto>();
        Assert.Equal("none", restored.Suspension);
        Assert.Equal("ready", (await user.NextAsync()).Status);
    }

    [Fact]
    public async Task Suspension_BuriedCardComesBackTomorrow()
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        var buried = await (await user.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = "buried" })).ReadAsync<CardDto>();

        Assert.Equal("buried", buried.Suspension);
        Assert.Equal("empty", (await user.NextAsync()).Status);
        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.Equal(1, stats.Maturity.Suspended);
    }

    [Theory]
    [InlineData("SUSPENDED", "suspended")]
    [InlineData(" Buried ", "buried")]
    public async Task Suspension_ModeIsCaseInsensitiveAndTrimmed(string mode, string expected)
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        var result = await (await user.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = mode })).ReadAsync<CardDto>();

        Assert.Equal(expected, result.Suspension);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("paused")]
    public async Task Suspension_InvalidMode_Returns400(string? mode)
    {
        var user = await factory.RegisterUserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog");

        var response = await user.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = mode });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Érvénytelen felfüggesztési mód.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Suspension_OthersCard_Returns404()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var card = await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, "dog");

        await (await intruder.PutJsonAsync($"/api/cards/{card.Id}/suspension", new SetCardSuspensionDto { Mode = "suspended" })).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    // ---- nehéz szó ----

    [Fact]
    public async Task Leech_AppearsAfterEnoughMistakes()
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(s =>
        {
            s.MinimumAnswerSeconds = 0;
            s.DailyNewCardGoal = 100;
            s.LeechThreshold = 2;
        });
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "dog");

        for (var i = 0; i < 2; i++)
        {
            (await user.SubmitAsync(await user.NextAsync(), isCorrect: false)).EnsureSuccessStatusCode();
        }

        Assert.True((await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}")).Single().IsLeech);
        Assert.Equal(1, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).LeechCount);
        Assert.True((await user.NextAsync()).Card!.IsLeech);
        Assert.True((await user.GetAsync<List<CardSearchResultDto>>("/api/cards/search?q=dog")).Single().IsLeech);
        Assert.Equal(card.Id, (await user.NextAsync()).Card!.Id);
    }

    // ---- keresés ----

    [Fact]
    public async Task Search_MatchesAllTextFieldsCaseInsensitively()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        await user.CreateCardAsync(deck.Id, "zebra-term", "plain", null, null, null);
        await user.CreateCardAsync(deck.Id, "a1", "contains ZEBRA inside", null, null, null);
        await user.CreateCardAsync(deck.Id, "a2", "plain", "An example with Zebra.", null, null);
        await user.CreateCardAsync(deck.Id, "a3", "plain", null, "csíkos zebra", null);
        await user.CreateCardAsync(deck.Id, "a4", "plain", null, null, "zebra-tag");
        await user.CreateCardAsync(deck.Id, "unrelated", "plain");

        var results = await user.GetAsync<List<CardSearchResultDto>>("/api/cards/search?q=ZeBrA");

        Assert.Equal(5, results.Count);
        Assert.DoesNotContain(results, r => r.Term == "unrelated");
        Assert.All(results, r => Assert.Equal("Saját pakli", r.DeckName));
    }

    [Theory]
    [InlineData("")]
    [InlineData("a")]
    [InlineData(" a ")]
    public async Task Search_ShorterThanTwoCharacters_ReturnsNothing(string query)
    {
        var user = await factory.RegisterUserAsync();
        await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "apple");

        Assert.Empty(await user.GetAsync<List<CardSearchResultDto>>($"/api/cards/search?q={Uri.EscapeDataString(query)}"));
    }

    [Fact]
    public async Task Search_WithoutQuery_ReturnsNothing()
    {
        var user = await factory.RegisterUserAsync();

        Assert.Empty(await user.GetAsync<List<CardSearchResultDto>>("/api/cards/search"));
    }

    [Fact]
    public async Task Search_OnlyFindsOwnCards()
    {
        var owner = await factory.RegisterUserAsync();
        var other = await factory.RegisterUserAsync();
        var token = $"uniq{Guid.NewGuid():N}";
        await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, token);

        Assert.Single(await owner.GetAsync<List<CardSearchResultDto>>($"/api/cards/search?q={token}"));
        Assert.Empty(await other.GetAsync<List<CardSearchResultDto>>($"/api/cards/search?q={token}"));
    }

    [Fact]
    public async Task Search_ReturnsAtMostFiftyResultsSortedByTerm()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var import = string.Join('\n', Enumerable.Range(0, 60).Select(i => $"item{i:D2},common definition,"));
        await user.Client.PostAsync($"/api/decks/{deck.Id}/import", new StringContent("term,definition,example\n" + import, System.Text.Encoding.UTF8, "text/csv"));

        var results = await user.GetAsync<List<CardSearchResultDto>>("/api/cards/search?q=common");

        Assert.Equal(50, results.Count);
        Assert.Equal(results.Select(r => r.Term).OrderBy(t => t, StringComparer.OrdinalIgnoreCase), results.Select(r => r.Term));
    }

    // ---- címkék ----

    [Fact]
    public async Task Tags_CountsPerTagForAllDecksOrOneDeck()
    {
        var user = await factory.RegisterUserAsync();
        var first = await user.DefaultDeckAsync();
        var second = await user.CreateDeckAsync();
        await user.CreateCardAsync(first.Id, "a", "d", tags: "food,drink");
        await user.CreateCardAsync(first.Id, "b", "d", tags: "food");
        await user.CreateCardAsync(second.Id, "c", "d", tags: "travel,food");
        await user.CreateCardAsync(second.Id, "d", "d");

        var all = await user.GetAsync<List<CardTagCountDto>>("/api/cards/tags");
        var onlyFirst = await user.GetAsync<List<CardTagCountDto>>($"/api/cards/tags?deckId={first.Id}");

        Assert.Equal([("drink", 1), ("food", 3), ("travel", 1)], all.Select(t => (t.Tag, t.Count)));
        Assert.Equal([("drink", 1), ("food", 2)], onlyFirst.Select(t => (t.Tag, t.Count)));
    }

    [Fact]
    public async Task Tags_NeverIncludeOtherUsersTags()
    {
        var owner = await factory.RegisterUserAsync();
        var other = await factory.RegisterUserAsync();
        await owner.CreateCardAsync((await owner.DefaultDeckAsync()).Id, "a", "d", tags: "secret");

        Assert.Empty(await other.GetAsync<List<CardTagCountDto>>("/api/cards/tags"));
    }

    // ---- törlés ----

    [Fact]
    public async Task Delete_RemovesCardAndItsProgress()
    {
        var user = await factory.RegisterUserAsync();
        await user.MakeStudyEasyAsync();
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "dog");
        (await user.SubmitAsync(await user.NextAsync(), isCorrect: false)).EnsureSuccessStatusCode();

        await (await user.Client.DeleteAsync($"/api/cards/{card.Id}")).AssertStatusAsync(HttpStatusCode.NoContent);

        Assert.Empty(await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
        Assert.Empty((await user.GetAsync<StudyStatsDto>("/api/study/stats")).Cards);
        await (await user.Client.DeleteAsync($"/api/cards/{card.Id}")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_CardWithConfusionAndFreeStudyMark_Succeeds()
    {
        var user = await factory.RegisterUserAsync();
        await user.MakeStudyEasyAsync();
        var deck = await user.DefaultDeckAsync();
        var cat = await user.CreateCardAsync(deck.Id, "cat");
        var dog = await user.CreateCardAsync(deck.Id, "dog");
        await user.PutJsonAsync($"/api/free-study/cards/{dog.Id}/mark", new MarkFreeStudyDto { Knows = true });
        // hibás válasz: a "dog" beírása a "cat" kártyánál összekeveredést rögzít
        var next = await NextForCardAsync(user, cat.Id);
        (await user.PostJsonAsync("/api/study/submit", new StudySubmitDto { CardId = cat.Id, IsCorrect = false, AnswerToken = next.AnswerToken!, TypedAnswer = "dog" }))
            .EnsureSuccessStatusCode();

        await (await user.Client.DeleteAsync($"/api/cards/{dog.Id}")).AssertStatusAsync(HttpStatusCode.NoContent);
        await (await user.Client.DeleteAsync($"/api/cards/{cat.Id}")).AssertStatusAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_OthersCard_Returns404AndKeepsIt()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var deck = await owner.DefaultDeckAsync();
        var card = await owner.CreateCardAsync(deck.Id, "dog");

        await (await intruder.Client.DeleteAsync($"/api/cards/{card.Id}")).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Single(await owner.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
    }

    // ---- hitelesítés ----

    [Theory]
    [InlineData("GET", "/api/cards/learned")]
    [InlineData("GET", "/api/cards/search?q=ab")]
    [InlineData("GET", "/api/cards/tags")]
    [InlineData("GET", "/api/cards/by-deck/1")]
    [InlineData("POST", "/api/cards")]
    [InlineData("PUT", "/api/cards/1")]
    [InlineData("PUT", "/api/cards/1/known")]
    [InlineData("PUT", "/api/cards/1/suspension")]
    [InlineData("POST", "/api/cards/1/reset-learned")]
    [InlineData("DELETE", "/api/cards/1")]
    public async Task EveryCardEndpoint_RequiresLogin(string method, string url)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method is "POST" or "PUT")
        {
            request.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
        }

        await (await factory.CreateAnonymousClient().SendAsync(request)).AssertStatusAsync(HttpStatusCode.Unauthorized);
    }

    /// <summary>Addig kéri a következő kártyát, amíg a keresett nem jön (a húzás súlyozott véletlen).</summary>
    private static async Task<StudyNextDto> NextForCardAsync(TestUser user, int cardId)
    {
        for (var i = 0; i < 200; i++)
        {
            var next = await user.NextAsync();
            if (next.Card?.Id == cardId)
            {
                return next;
            }
        }

        throw new InvalidOperationException("A kártya nem jött fel.");
    }
}
