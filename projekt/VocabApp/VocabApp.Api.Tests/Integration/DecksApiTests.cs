using System.Net;
using System.Net.Http.Json;
using System.Text;
using VocabApp.Api.DTOs;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

[Collection(ApiCollection.Name)]
public class DecksApiTests(ApiFactory factory)
{
    private static string UniqueName(string prefix = "Pakli") => $"{prefix} {Guid.NewGuid():N}"[..24];

    private static StringContent Csv(string text) => new(text, Encoding.UTF8, "text/csv");

    // ---- létrehozás ----

    [Fact]
    public async Task Create_Valid_ReturnsEmptyDeck()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = "Étel", Description = "Ételek", ExampleLevel = "B2" });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var deck = await response.ReadAsync<DeckDto>();
        Assert.Equal("Étel", deck.Name);
        Assert.Equal("Ételek", deck.Description);
        Assert.Equal("B2", deck.ExampleLevel);
        Assert.Equal(0, deck.CardCount);
        Assert.Equal(0, deck.LearnedCount);
        Assert.Equal(0, deck.DueCount);
        Assert.False(deck.IsPublic);
        Assert.Null(deck.Share);
    }

    [Fact]
    public async Task Create_TrimsNameAndMapsBlankDescriptionToNull()
    {
        var user = await factory.RegisterUserAsync();

        var deck = await (await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = "  Szóló  ", Description = "   " })).ReadAsync<DeckDto>();

        Assert.Equal("Szóló", deck.Name);
        Assert.Null(deck.Description);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("    ")]
    public async Task Create_MissingName_Returns400(string? name)
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = name });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("A pakli nevének megadása kötelező.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Create_NameLengthBoundary()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = new string('a', 100) })).AssertStatusAsync(HttpStatusCode.OK);
        var tooLong = await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = new string('a', 101) });

        await tooLong.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("A pakli neve legfeljebb 100 karakter lehet.", await tooLong.ProblemTitleAsync());
    }

    [Fact]
    public async Task Create_DescriptionLengthBoundary()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = UniqueName(), Description = new string('d', 500) }))
            .AssertStatusAsync(HttpStatusCode.OK);
        var tooLong = await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = UniqueName(), Description = new string('d', 501) });

        await tooLong.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Theory]
    [InlineData("A1")]
    [InlineData("C2")]
    public async Task Create_ValidExampleLevel_IsAccepted(string level)
    {
        var user = await factory.RegisterUserAsync();

        var deck = await (await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = UniqueName(), ExampleLevel = level })).ReadAsync<DeckDto>();

        Assert.Equal(level, deck.ExampleLevel);
    }

    [Theory]
    [InlineData("D1")]
    [InlineData("b1")]
    [InlineData("xx")]
    public async Task Create_InvalidExampleLevel_Returns400(string level)
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = UniqueName(), ExampleLevel = level });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("A mondatszint érvénytelen.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Create_BlankExampleLevel_MeansAccountLevel()
    {
        var user = await factory.RegisterUserAsync();

        var deck = await (await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = UniqueName(), ExampleLevel = "  " })).ReadAsync<DeckDto>();

        Assert.Null(deck.ExampleLevel);
    }

    [Fact]
    public async Task List_ReturnsOnlyOwnDecksInCreationOrder()
    {
        var user = await factory.RegisterUserAsync();
        var other = await factory.RegisterUserAsync();
        var first = await user.CreateDeckAsync("Első");
        var second = await user.CreateDeckAsync("Második");
        await other.CreateDeckAsync("Idegen");

        var names = (await user.GetAsync<List<DeckDto>>("/api/decks")).Select(d => d.Name).ToList();

        Assert.Equal(["Saját pakli", "Első", "Második"], names);
        Assert.True(first.Id < second.Id);
    }

    [Fact]
    public async Task List_CardCountsAndLearnedCountsAreReported()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var cards = await user.CreateCardsAsync(deck.Id, 3);
        (await user.PutJsonAsync($"/api/cards/{cards[0].Id}/known", new SetCardKnownDto { Known = true })).EnsureSuccessStatusCode();

        var listed = (await user.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == deck.Id);

        Assert.Equal(3, listed.CardCount);
        Assert.Equal(1, listed.LearnedCount);
    }

    // ---- átnevezés, leírás, szint ----

    [Fact]
    public async Task Rename_ChangesNameAndTrims()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var renamed = await (await user.PutJsonAsync($"/api/decks/{deck.Id}", new RenameDeckDto { Name = "  Új név " })).ReadAsync<DeckDto>();

        Assert.Equal("Új név", renamed.Name);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("  ")]
    public async Task Rename_BlankName_Returns400(string? name)
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        await (await user.PutJsonAsync($"/api/decks/{deck.Id}", new RenameDeckDto { Name = name })).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Rename_TooLong_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        await (await user.PutJsonAsync($"/api/decks/{deck.Id}", new RenameDeckDto { Name = new string('x', 101) }))
            .AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Rename_UnknownDeck_Returns404()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.PutJsonAsync("/api/decks/99999999", new RenameDeckDto { Name = "x" })).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task UpdateDescription_SetsAndClears()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync(description: "régi");

        var set = await (await user.PutJsonAsync($"/api/decks/{deck.Id}/description", new UpdateDeckDescriptionDto { Description = " új leírás " }))
            .ReadAsync<DeckDto>();
        var cleared = await (await user.PutJsonAsync($"/api/decks/{deck.Id}/description", new UpdateDeckDescriptionDto { Description = "" }))
            .ReadAsync<DeckDto>();

        Assert.Equal("új leírás", set.Description);
        Assert.Null(cleared.Description);
    }

    [Fact]
    public async Task UpdateDescription_TooLong_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.PutJsonAsync($"/api/decks/{deck.Id}/description", new UpdateDeckDescriptionDto { Description = new string('x', 501) });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("A pakli leírása legfeljebb 500 karakter lehet.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task UpdateExampleLevel_SetsAndClearsWithNull()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var set = await (await user.PutJsonAsync($"/api/decks/{deck.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = "C1" }))
            .ReadAsync<DeckDto>();
        var cleared = await (await user.PutJsonAsync($"/api/decks/{deck.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = null }))
            .ReadAsync<DeckDto>();

        Assert.Equal("C1", set.ExampleLevel);
        Assert.Null(cleared.ExampleLevel);
    }

    [Theory]
    [InlineData("Z9")]
    [InlineData("")]
    public async Task UpdateExampleLevel_Invalid_Returns400(string level)
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        await (await user.PutJsonAsync($"/api/decks/{deck.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = level }))
            .AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task UpdateExampleLevel_LongerThanTwoCharacters_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        await (await user.PutJsonAsync($"/api/decks/{deck.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = "B12" }))
            .AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    // ---- törlés ----

    [Fact]
    public async Task Delete_RemovesDeckAndItsCards()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "doomed");

        await (await user.Client.DeleteAsync($"/api/decks/{deck.Id}")).AssertStatusAsync(HttpStatusCode.NoContent);

        Assert.DoesNotContain(await user.GetAsync<List<DeckDto>>("/api/decks"), d => d.Id == deck.Id);
        await (await user.Client.GetAsync($"/api/cards/by-deck/{deck.Id}")).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await user.PutJsonAsync($"/api/cards/{card.Id}/known", new SetCardKnownDto { Known = true })).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_UnknownDeck_Returns404()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.Client.DeleteAsync("/api/decks/99999999")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Delete_DeckWithStudyHistory_Succeeds()
    {
        var user = await factory.RegisterUserAsync();
        await user.MakeStudyEasyAsync();
        var deck = await user.CreateDeckAsync();
        await user.CreateCardsAsync(deck.Id, 2);
        var next = await user.NextAsync($"?deckId={deck.Id}");
        (await user.SubmitAsync(next, isCorrect: false)).EnsureSuccessStatusCode();

        await (await user.Client.DeleteAsync($"/api/decks/{deck.Id}")).AssertStatusAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_SharedDeck_RemovesTheSharedCopyFromThePublicList()
    {
        var owner = await factory.RegisterUserAsync();
        var reader = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync(UniqueName("Közös"));
        await owner.CreateCardAsync(deck.Id, "w");
        (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true })).EnsureSuccessStatusCode();
        Assert.Single(await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString(deck.Name)}"));

        await (await owner.Client.DeleteAsync($"/api/decks/{deck.Id}")).AssertStatusAsync(HttpStatusCode.NoContent);

        Assert.Empty(await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString(deck.Name)}"));
    }

    // ---- idegen adatok ----

    [Fact]
    public async Task OtherUsersDeck_IsInvisibleToEveryDeckEndpoint()
    {
        var owner = await factory.RegisterUserAsync();
        var intruder = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync();
        await owner.CreateCardAsync(deck.Id, "secret");
        var id = deck.Id;

        await (await intruder.PutJsonAsync($"/api/decks/{id}", new RenameDeckDto { Name = "hack" })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.PutJsonAsync($"/api/decks/{id}/description", new UpdateDeckDescriptionDto { Description = "x" })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.PutJsonAsync($"/api/decks/{id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = "A1" })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.PutJsonAsync($"/api/decks/{id}/share", new ShareDeckDto { IsPublic = true })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.PostAsync($"/api/decks/{id}/share/update", null)).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.PostAsync($"/api/decks/{id}/update-from-source", null)).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.GetAsync($"/api/decks/{id}/export")).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.PostAsync($"/api/decks/{id}/import", Csv("term,definition,example\na,b,"))).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.PostJsonAsync($"/api/decks/{id}/import/cards", new ImportCardsDto { Cards = [new ImportCardRowDto { Term = "a", Definition = "b" }] }))
            .AssertStatusAsync(HttpStatusCode.NotFound);
        await (await intruder.Client.DeleteAsync($"/api/decks/{id}")).AssertStatusAsync(HttpStatusCode.NotFound);

        var unchanged = (await owner.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == id);
        Assert.Equal(deck.Name, unchanged.Name);
        Assert.Equal(1, unchanged.CardCount);
    }

    // ---- export ----

    [Fact]
    public async Task Export_ReturnsCsvWithBomHeaderAndRows()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync("Állatok és más");
        await user.CreateCardAsync(deck.Id, "dog", "a domestic animal", "The dog barks.", "kutya", "Animal, pet");

        var response = await user.Client.GetAsync($"/api/decks/{deck.Id}/export");

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal("text/csv", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains("Állatok-és-más.csv", response.Content.Headers.ContentDisposition?.ToString() + response.Content.Headers.ContentDisposition?.FileNameStar + response.Content.Headers.ContentDisposition?.FileName);
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal([0xEF, 0xBB, 0xBF], bytes[..3]);
        var text = Encoding.UTF8.GetString(bytes[3..]);
        Assert.StartsWith("term,definition,example,targetMeanings,tags", text);
        Assert.Contains("\"dog\",\"a domestic animal\",\"The dog barks.\",\"kutya\",\"animal,pet\"", text);
    }

    [Fact]
    public async Task ExportThenImport_RoundTripsTheCards()
    {
        var user = await factory.RegisterUserAsync();
        var source = await user.CreateDeckAsync();
        await user.CreateCardAsync(source.Id, "dog", "a domestic animal", "The dog barks.", "kutya", "animal");
        await user.CreateCardAsync(source.Id, "say \"hi\"", "line, with comma", null, null, null);
        var target = await user.CreateDeckAsync();

        var csv = await (await user.Client.GetAsync($"/api/decks/{source.Id}/export")).Content.ReadAsStringAsync();
        var imported = await user.Client.PostAsync($"/api/decks/{target.Id}/import", Csv(csv));

        await imported.AssertStatusAsync(HttpStatusCode.OK);
        var result = await imported.ReadAsync<ImportDeckResultDto>();
        Assert.Equal(2, result.ImportedCount);
        var cards = await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{target.Id}");
        Assert.Equal(["dog", "say \"hi\""], cards.Select(c => c.Term));
        Assert.Equal("kutya", cards[0].TargetMeanings);
        Assert.Equal("line, with comma", cards[1].Definition);
    }

    // ---- import ----

    [Fact]
    public async Task ImportCsv_ImportsValidRowsAndReportsSkippedOnes()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var csv = "term,definition,example\ncat,a small animal,\nbroken-row\nbird,a flying animal,\n";

        var response = await user.Client.PostAsync($"/api/decks/{deck.Id}/import", Csv(csv));

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<ImportDeckResultDto>();
        Assert.Equal(2, result.ImportedCount);
        Assert.Equal(1, result.SkippedCount);
        Assert.Contains("3. sor", Assert.Single(result.SkippedRows));
        Assert.Equal(2, (await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}")).Count);
    }

    [Fact]
    public async Task ImportCsv_NewCardsStartAsNewCards()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        await user.Client.PostAsync($"/api/decks/{deck.Id}/import", Csv("term,definition,example\ncat,a small animal,"));

        var card = Assert.Single(await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
        Assert.False(card.IsLearned);
        Assert.Equal("none", card.Suspension);
    }

    [Fact]
    public async Task ImportCsv_SemicolonFileWithAllColumns()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var csv = "term;definition;example;targetMeanings;tags\r\ndog;a domestic animal;;kutya;Animal\r\n";

        var result = await (await user.Client.PostAsync($"/api/decks/{deck.Id}/import", Csv(csv))).ReadAsync<ImportDeckResultDto>();

        Assert.Equal(1, result.ImportedCount);
        var card = Assert.Single(await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
        Assert.Equal("kutya", card.TargetMeanings);
        Assert.Equal("animal", card.Tags);
    }

    [Theory]
    [InlineData("")]
    [InlineData("word,meaning\na,b")]
    public async Task ImportCsv_BadOrMissingHeader_Returns400(string csv)
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        await (await user.Client.PostAsync($"/api/decks/{deck.Id}/import", Csv(csv))).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task ImportCsv_NoImportableRow_Returns400AndImportsNothing()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.Client.PostAsync($"/api/decks/{deck.Id}/import", Csv("term,definition,example\n,,\nonly-one"));

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.StartsWith("Egyetlen sor sem volt importálható.", await response.ProblemTitleAsync());
        Assert.Empty(await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
    }

    [Fact]
    public async Task ImportCsv_HeaderOnly_ImportsZero()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var result = await (await user.Client.PostAsync($"/api/decks/{deck.Id}/import", Csv("term,definition,example"))).ReadAsync<ImportDeckResultDto>();

        Assert.Equal(0, result.ImportedCount);
        Assert.Equal(0, result.SkippedCount);
    }

    [Fact]
    public async Task ImportCsv_WrongContentType_Returns415()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.Client.PostAsync(
            $"/api/decks/{deck.Id}/import",
            new StringContent("term,definition,example\na,b,", Encoding.UTF8, "application/json"));

        await response.AssertStatusAsync(HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task ImportCsv_ReportsAtMostTenSkippedRows()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var bad = string.Join('\n', Enumerable.Range(0, 15).Select(i => $"bad{i}"));

        var result = await (await user.Client.PostAsync($"/api/decks/{deck.Id}/import", Csv($"term,definition,example\nok,fine,\n{bad}")))
            .ReadAsync<ImportDeckResultDto>();

        Assert.Equal(1, result.ImportedCount);
        Assert.Equal(15, result.SkippedCount);
        Assert.Equal(10, result.SkippedRows.Count);
    }

    [Fact]
    public async Task ImportCards_Json_ImportsAndNormalizesRows()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.PostJsonAsync($"/api/decks/{deck.Id}/import/cards", new ImportCardsDto
        {
            Cards =
            [
                new ImportCardRowDto { Term = "  cat ", Definition = " small ", Example = "A cat.", TargetMeanings = "macska", Tags = "Animal; Pet" },
                new ImportCardRowDto { Term = "", Definition = "no term" },
                new ImportCardRowDto { Term = "x".PadRight(101, 'x'), Definition = "too long" }
            ]
        });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<ImportDeckResultDto>();
        Assert.Equal(1, result.ImportedCount);
        Assert.Equal(2, result.SkippedCount);
        var card = Assert.Single(await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
        Assert.Equal("cat", card.Term);
        Assert.Equal("small", card.Definition);
        Assert.Equal("animal,pet", card.Tags);
    }

    [Fact]
    public async Task ImportCards_EmptyList_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.PostJsonAsync($"/api/decks/{deck.Id}/import/cards", new ImportCardsDto());

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Nincs importálható sor.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task ImportCards_AllRowsInvalid_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.PostJsonAsync(
            $"/api/decks/{deck.Id}/import/cards",
            new ImportCardsDto { Cards = [new ImportCardRowDto { Term = "a" }, new ImportCardRowDto { Definition = "b" }] });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task ImportCards_MoreThanTenThousandRows_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        var rows = Enumerable.Range(0, 10001).Select(_ => new ImportCardRowDto { Term = "a", Definition = "b" }).ToList();

        var response = await user.PostJsonAsync($"/api/decks/{deck.Id}/import/cards", new ImportCardsDto { Cards = rows });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Empty(await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}"));
    }

    // ---- megosztás ----

    private async Task<(TestUser Owner, DeckDto Deck)> SharedDeckAsync(int cards = 2)
    {
        var owner = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync(UniqueName("Közös"), "leírás");
        await owner.CreateCardsAsync(deck.Id, cards, "shared");
        var shared = await (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true })).ReadAsync<DeckDto>();
        return (owner, shared);
    }

    private static async Task<PublicDeckDto?> FindPublicAsync(TestUser viewer, DeckDto deck)
    {
        var list = await viewer.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString(deck.Name)}");
        return list.SingleOrDefault();
    }

    [Fact]
    public async Task Share_PublishesVersionOneToOtherUsersOnly()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();

        Assert.True(deck.IsPublic);
        Assert.NotNull(deck.Share);
        Assert.Equal(1, deck.Share!.Version);
        Assert.True(deck.Share.IsActive);
        Assert.False(deck.Share.HasUnpublishedChanges);
        Assert.Equal(0, deck.Share.SaveCount);

        var publicDeck = await FindPublicAsync(reader, deck);
        Assert.NotNull(publicDeck);
        Assert.Equal(2, publicDeck!.CardCount);
        Assert.Equal(owner.Username, publicDeck.OwnerUsername);
        Assert.Equal(1, publicDeck.Version);
        Assert.False(publicDeck.AlreadySaved);
        Assert.Null(await FindPublicAsync(owner, deck));
    }

    [Fact]
    public async Task Share_EmptyDeck_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Üres paklit nem lehet megosztani.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Share_InvalidLevel_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        await user.CreateCardAsync(deck.Id, "w");

        await (await user.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true, ExampleLevel = "ZZ" }))
            .AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Share_WithLevel_StoresItOnTheDeckAndTheShare()
    {
        var user = await factory.RegisterUserAsync();
        var reader = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync(UniqueName("Szint"));
        await user.CreateCardAsync(deck.Id, "w");

        var shared = await (await user.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true, ExampleLevel = "C1" })).ReadAsync<DeckDto>();

        Assert.Equal("C1", shared.ExampleLevel);
        var publicDeck = await FindPublicAsync(reader, shared);
        Assert.Equal("C1", publicDeck!.ExampleLevel);
        Assert.False(publicDeck.LevelIsAutomatic);
    }

    [Fact]
    public async Task Share_WithoutLevel_UsesTheOwnersLevelAsAutomatic()
    {
        var (_, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();

        var publicDeck = await FindPublicAsync(reader, deck);

        Assert.True(publicDeck!.LevelIsAutomatic);
        Assert.Equal("B1", publicDeck.ExampleLevel);
    }

    [Fact]
    public async Task Share_Twice_KeepsVersionOne()
    {
        var (owner, deck) = await SharedDeckAsync();

        var again = await (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true })).ReadAsync<DeckDto>();

        Assert.Equal(1, again.Share!.Version);
    }

    [Fact]
    public async Task Unshare_HidesFromPublicListButKeepsTheVersion()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();

        var unshared = await (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = false })).ReadAsync<DeckDto>();

        Assert.False(unshared.IsPublic);
        Assert.False(unshared.Share!.IsActive);
        Assert.Equal(1, unshared.Share.Version);
        Assert.Null(await FindPublicAsync(reader, deck));
    }

    [Fact]
    public async Task Unshare_NeverSharedDeck_IsHarmless()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = false });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.False((await response.ReadAsync<DeckDto>()).IsPublic);
    }

    [Fact]
    public async Task Reshare_UnchangedDeck_KeepsVersion_ChangedDeck_BumpsVersion()
    {
        var (owner, deck) = await SharedDeckAsync();
        await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = false });

        var same = await (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true })).ReadAsync<DeckDto>();
        Assert.Equal(1, same.Share!.Version);

        await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = false });
        await owner.CreateCardAsync(deck.Id, "extra");
        var changed = await (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true })).ReadAsync<DeckDto>();
        Assert.Equal(2, changed.Share!.Version);
    }

    [Fact]
    public async Task EditingAfterSharing_MarksUnpublishedChanges()
    {
        var (owner, deck) = await SharedDeckAsync();

        await owner.CreateCardAsync(deck.Id, "later");

        var current = (await owner.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == deck.Id);
        Assert.True(current.Share!.HasUnpublishedChanges);
        Assert.Equal(1, current.Share.Version);
    }

    [Fact]
    public async Task PublishUpdate_PublishesNewVersion()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();
        await owner.CreateCardAsync(deck.Id, "later");

        var response = await owner.Client.PostAsync($"/api/decks/{deck.Id}/share/update", null);

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var updated = await response.ReadAsync<DeckDto>();
        Assert.Equal(2, updated.Share!.Version);
        Assert.False(updated.Share.HasUnpublishedChanges);
        var publicDeck = await FindPublicAsync(reader, deck);
        Assert.Equal(3, publicDeck!.CardCount);
        Assert.Equal(2, publicDeck.Version);
    }

    [Fact]
    public async Task PublishUpdate_WithoutChanges_Returns409()
    {
        var (owner, deck) = await SharedDeckAsync();

        var response = await owner.Client.PostAsync($"/api/decks/{deck.Id}/share/update", null);

        await response.AssertStatusAsync(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task PublishUpdate_NotShared_Returns409()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        var response = await user.Client.PostAsync($"/api/decks/{deck.Id}/share/update", null);

        await response.AssertStatusAsync(HttpStatusCode.Conflict);
        Assert.Equal("A pakli nincs megosztva.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task PublishUpdate_AfterEmptyingTheDeck_Returns400()
    {
        var (owner, deck) = await SharedDeckAsync(cards: 1);
        var card = (await owner.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}")).Single();
        await owner.Client.DeleteAsync($"/api/cards/{card.Id}");

        var response = await owner.Client.PostAsync($"/api/decks/{deck.Id}/share/update", null);

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PublicList_FiltersByNameDescriptionAndOwner()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();

        var byName = await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString(deck.Name.ToUpperInvariant())}");
        var byDescription = await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString("LEÍRÁS")}&owner={owner.Username}");
        var byOwner = await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?owner={owner.Username}");
        var noMatch = await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Guid.NewGuid():N}");

        Assert.Single(byName);
        Assert.Single(byDescription);
        Assert.Single(byOwner);
        Assert.Empty(noMatch);
    }

    [Fact]
    public async Task PublicList_SortsByCardCountAscendingAndDescending()
    {
        var owner = await factory.RegisterUserAsync();
        var reader = await factory.RegisterUserAsync();
        foreach (var count in new[] { 3, 1, 2 })
        {
            var deck = await owner.CreateDeckAsync(UniqueName($"S{count}"));
            await owner.CreateCardsAsync(deck.Id, count);
            await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true });
        }

        var ascending = await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?owner={owner.Username}&sort=cards");
        var descending = await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?owner={owner.Username}&sort=cards&desc=true");

        Assert.Equal([1, 2, 3], ascending.Select(d => d.CardCount));
        Assert.Equal([3, 2, 1], descending.Select(d => d.CardCount));
    }

    [Fact]
    public async Task PublicList_DefaultSortIsByName()
    {
        var owner = await factory.RegisterUserAsync();
        var reader = await factory.RegisterUserAsync();
        foreach (var name in new[] { "Cseresznye", "Alma", "Barack" })
        {
            var deck = await owner.CreateDeckAsync($"{name}-{Guid.NewGuid():N}"[..20]);
            await owner.CreateCardAsync(deck.Id, "w");
            await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true });
        }

        var names = (await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?owner={owner.Username}")).Select(d => d.Name[..3]);

        Assert.Equal(["Alm", "Bar", "Cse"], names);
    }

    [Fact]
    public async Task PublicCards_ReturnsSnapshotCardsToOtherUsers()
    {
        var (owner, deck) = await SharedDeckAsync(cards: 2);
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;

        var cards = await reader.GetAsync<List<CardDto>>($"/api/decks/public/{publicDeck.Id}/cards");

        Assert.Equal(["shared1", "shared2"], cards.Select(c => c.Term));
        // a pillanatkép nem változik, amíg a tulajdonos nem frissít
        await owner.CreateCardAsync(deck.Id, "unpublished");
        Assert.Equal(2, (await reader.GetAsync<List<CardDto>>($"/api/decks/public/{publicDeck.Id}/cards")).Count);
    }

    [Fact]
    public async Task PublicCards_OwnUnknownAndUnsharedDecks_Return404()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;

        await (await owner.Client.GetAsync($"/api/decks/public/{publicDeck.Id}/cards")).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await reader.Client.GetAsync("/api/decks/public/99999999/cards")).AssertStatusAsync(HttpStatusCode.NotFound);

        await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = false });
        await (await reader.Client.GetAsync($"/api/decks/public/{publicDeck.Id}/cards")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    // ---- másolás és frissítés a forrásból ----

    [Fact]
    public async Task Copy_CreatesOwnDeckWithFreshCardsAndSourceInfo()
    {
        var (owner, deck) = await SharedDeckAsync(cards: 2);
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;

        var response = await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null);

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var copy = await response.ReadAsync<DeckDto>();
        Assert.Equal(deck.Name, copy.Name);
        Assert.Equal(2, copy.CardCount);
        Assert.Equal(0, copy.LearnedCount);
        Assert.Equal(publicDeck.Id, copy.SourceSharedDeckId);
        Assert.Equal(1, copy.SourceVersion);
        Assert.False(copy.UpdateAvailable);
        Assert.False(copy.IsPublic);
        Assert.Equal(["shared1", "shared2"], (await reader.GetAsync<List<CardDto>>($"/api/cards/by-deck/{copy.Id}")).Select(c => c.Term));

        // a tulajdonos nézetében nő a mentések száma, a közös listában "már mentve"
        var ownerView = (await owner.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == deck.Id);
        Assert.Equal(1, ownerView.Share!.SaveCount);
        Assert.True((await FindPublicAsync(reader, deck))!.AlreadySaved);
    }

    [Fact]
    public async Task Copy_SameUserTwice_CountsAsOneSave()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;

        await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null);
        await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null);

        var ownerView = (await owner.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == deck.Id);
        Assert.Equal(1, ownerView.Share!.SaveCount);
        Assert.Equal(2, (await reader.GetAsync<List<DeckDto>>("/api/decks")).Count(d => d.Name == deck.Name));
    }

    [Fact]
    public async Task Copy_OwnAndUnknownDecks_Return404()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;

        await (await owner.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null)).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await reader.Client.PostAsync("/api/decks/public/99999999/copy", null)).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Copy_IsIndependentOfTheOriginal()
    {
        var (owner, deck) = await SharedDeckAsync(cards: 1);
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;
        var copy = await (await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null)).ReadAsync<DeckDto>();

        await reader.CreateCardAsync(copy.Id, "mine-only");
        var ownerCard = (await owner.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}")).Single();
        await owner.Client.DeleteAsync($"/api/cards/{ownerCard.Id}");

        Assert.Equal(2, (await reader.GetAsync<List<CardDto>>($"/api/cards/by-deck/{copy.Id}")).Count);
    }

    [Fact]
    public async Task UpdateFromSource_AddsNewCardsUpdatesTextAndKeepsLocalOnes()
    {
        var owner = await factory.RegisterUserAsync();
        var reader = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync(UniqueName("Forrás"));
        var original = await owner.CreateCardAsync(deck.Id, "alpha", "old definition");
        await owner.CreateCardAsync(deck.Id, "beta", "beta definition");
        await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true });
        var publicDeck = (await FindPublicAsync(reader, deck))!;
        var copy = await (await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null)).ReadAsync<DeckDto>();
        await reader.CreateCardAsync(copy.Id, "local", "only mine");

        // a tulajdonos módosít és bővít
        (await owner.PutJsonAsync($"/api/cards/{original.Id}", new UpdateCardDto { Term = "alpha", Definition = "new definition" })).EnsureSuccessStatusCode();
        await owner.CreateCardAsync(deck.Id, "gamma", "brand new");
        (await owner.Client.PostAsync($"/api/decks/{deck.Id}/share/update", null)).EnsureSuccessStatusCode();

        var outdated = (await reader.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == copy.Id);
        Assert.True(outdated.UpdateAvailable);
        Assert.Equal(2, outdated.LatestSharedVersion);

        var response = await reader.Client.PostAsync($"/api/decks/{copy.Id}/update-from-source", null);

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<DeckSourceUpdateResultDto>();
        Assert.Equal(1, result.AddedCount);
        Assert.Equal(1, result.UpdatedCount);
        Assert.Equal(1, result.LocalOnlyCount);
        Assert.False(result.Deck.UpdateAvailable);
        Assert.Equal(2, result.Deck.SourceVersion);
        var cards = await reader.GetAsync<List<CardDto>>($"/api/cards/by-deck/{copy.Id}");
        Assert.Equal("new definition", cards.Single(c => c.Term == "alpha").Definition);
        Assert.Contains(cards, c => c.Term == "gamma");
        Assert.Contains(cards, c => c.Term == "local");
        Assert.Equal(4, cards.Count);
    }

    [Fact]
    public async Task UpdateFromSource_KeepsStudyProgressOfExistingCards()
    {
        var owner = await factory.RegisterUserAsync();
        var reader = await factory.RegisterUserAsync();
        await reader.MakeStudyEasyAsync();
        var deck = await owner.CreateDeckAsync(UniqueName("Haladás"));
        var original = await owner.CreateCardAsync(deck.Id, "alpha", "def");
        await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true });
        var publicDeck = (await FindPublicAsync(reader, deck))!;
        var copy = await (await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null)).ReadAsync<DeckDto>();
        var next = await reader.NextAsync($"?deckId={copy.Id}");
        (await reader.SubmitAsync(next, isCorrect: true)).EnsureSuccessStatusCode();
        await owner.PutJsonAsync($"/api/cards/{original.Id}", new UpdateCardDto { Term = "alpha", Definition = "changed" });
        await owner.Client.PostAsync($"/api/decks/{deck.Id}/share/update", null);

        await reader.Client.PostAsync($"/api/decks/{copy.Id}/update-from-source", null);

        var stats = await reader.GetAsync<StudyStatsDto>("/api/study/stats");
        var card = stats.Cards.Single(c => c.Term == "alpha");
        Assert.Equal(1, card.Streak);
        Assert.Equal(1, card.CorrectCount);
    }

    [Fact]
    public async Task UpdateFromSource_AlreadyLatest_Returns409()
    {
        var (_, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;
        var copy = await (await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null)).ReadAsync<DeckDto>();

        var response = await reader.Client.PostAsync($"/api/decks/{copy.Id}/update-from-source", null);

        await response.AssertStatusAsync(HttpStatusCode.Conflict);
        Assert.Equal("A pakli már a legfrissebb verzión van.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task UpdateFromSource_DeckWithoutSource_Returns409()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();

        await (await user.Client.PostAsync($"/api/decks/{deck.Id}/update-from-source", null)).AssertStatusAsync(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task UpdateFromSource_SourceNoLongerShared_Returns409AndHidesSourceInfo()
    {
        var (owner, deck) = await SharedDeckAsync();
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await FindPublicAsync(reader, deck))!;
        var copy = await (await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null)).ReadAsync<DeckDto>();
        await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = false });

        var listed = (await reader.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == copy.Id);
        Assert.Null(listed.SourceSharedDeckId);
        Assert.False(listed.UpdateAvailable);
        await (await reader.Client.PostAsync($"/api/decks/{copy.Id}/update-from-source", null)).AssertStatusAsync(HttpStatusCode.Conflict);
    }

    // ---- hitelesítés ----

    [Theory]
    [InlineData("GET", "/api/decks")]
    [InlineData("POST", "/api/decks")]
    [InlineData("PUT", "/api/decks/1")]
    [InlineData("PUT", "/api/decks/1/description")]
    [InlineData("PUT", "/api/decks/1/example-level")]
    [InlineData("PUT", "/api/decks/1/share")]
    [InlineData("POST", "/api/decks/1/share/update")]
    [InlineData("POST", "/api/decks/1/update-from-source")]
    [InlineData("GET", "/api/decks/public")]
    [InlineData("GET", "/api/decks/public/1/cards")]
    [InlineData("POST", "/api/decks/public/1/copy")]
    [InlineData("DELETE", "/api/decks/1")]
    [InlineData("GET", "/api/decks/1/export")]
    [InlineData("POST", "/api/decks/1/import")]
    [InlineData("POST", "/api/decks/1/import/cards")]
    public async Task EveryDeckEndpoint_RequiresLogin(string method, string url)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method is "POST" or "PUT")
        {
            request.Content = new StringContent("{}", Encoding.UTF8, url.EndsWith("/import") ? "text/csv" : "application/json");
        }

        var response = await factory.CreateAnonymousClient().SendAsync(request);

        await response.AssertStatusAsync(HttpStatusCode.Unauthorized);
    }
}
