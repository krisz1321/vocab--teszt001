using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

/// <summary>
/// A valódi <c>AiService</c> és az <c>AiController</c> egy hamis OpenRouter-kiszolgáló ellen: a kérések felépítését,
/// az MI-válaszok ellenőrzését, az újrapróbálást, a gyorsítótárat és a hibák leképezését vizsgálja, külső hívás nélkül.
/// </summary>
[Collection(RealAiCollection.Name)]
public class AiServiceApiTests
{
    private readonly RealAiApiFactory factory;

    public AiServiceApiTests(RealAiApiFactory factory)
    {
        this.factory = factory;
        factory.AiServer.Reset();
    }

    private ScriptedAiServer Server => factory.AiServer;

    /// <summary>Egyedi, csak betűből és számból álló szó, hogy a globális mentett definíciók ne ütközzenek.</summary>
    private static string Word() => "zq" + Guid.NewGuid().ToString("N")[..10];

    /// <summary>Alapból a mentett példák újrahasznosítása ki van kapcsolva, hogy ne legyen véletlen ág.</summary>
    private async Task<TestUser> UserAsync(Action<StudySettingsDto>? tweak = null)
    {
        var user = await factory.RegisterUserAsync();
        await user.SaveSettingsAsync(settings =>
        {
            settings.ReuseSavedExamples = false;
            tweak?.Invoke(settings);
        });
        return user;
    }

    private static Task<HttpResponseMessage> PostAsync(TestUser user, string url, object body) =>
        user.Client.PostAsJsonAsync(url, body);

    private async Task<(TestUser User, CardDto Card)> UserWithCardAsync(string? term = null, string definition = "a known definition", Action<StudySettingsDto>? tweak = null)
    {
        var user = await UserAsync(tweak);
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, term ?? Word(), definition);
        return (user, card);
    }

    // ================= átjáró: modellek, hitelesítés, konfiguráció =================

    [Fact]
    public async Task Models_ListsTheConfiguredModelsWithoutCallingTheProvider()
    {
        var user = await UserAsync();

        var models = await user.GetAsync<AiModelsDto>("/api/ai/models");

        Assert.Equal(AiModels.Default, models.Default);
        Assert.Equal(AiModels.All.Select(m => m.Id), models.Models.Select(m => m.Id));
        Assert.Equal(AiModels.All.Select(m => m.Label), models.Models.Select(m => m.Label));
        Assert.Empty(Server.Requests);
    }

    [Theory]
    [InlineData("GET", "/api/ai/models")]
    [InlineData("POST", "/api/ai/generate/definition")]
    [InlineData("POST", "/api/ai/generate/card-definition")]
    [InlineData("POST", "/api/ai/generate/extra-definition")]
    [InlineData("POST", "/api/ai/generate/example")]
    [InlineData("POST", "/api/ai/generate/deck-fill")]
    [InlineData("POST", "/api/ai/generate/target-meaning")]
    [InlineData("POST", "/api/ai/recognize-ambiguity")]
    [InlineData("POST", "/api/ai/validate")]
    [InlineData("POST", "/api/ai/appeal-answer")]
    [InlineData("POST", "/api/ai/explain-answer")]
    [InlineData("POST", "/api/ai/grammar/check")]
    [InlineData("POST", "/api/ai/grammar/example")]
    [InlineData("POST", "/api/ai/grammar/hint")]
    [InlineData("POST", "/api/ai/composition/check")]
    [InlineData("POST", "/api/ai/composition/example")]
    [InlineData("POST", "/api/ai/composition/hint")]
    public async Task EveryAiEndpoint_RequiresLogin_AndNeverCallsTheProvider(string method, string url)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method == "POST")
        {
            request.Content = JsonContent.Create(new { });
        }

        var response = await factory.CreateAnonymousClient().SendAsync(request);

        await response.AssertStatusAsync(HttpStatusCode.Unauthorized);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task MissingApiKey_MapsTo503_WithoutCallingTheProvider()
    {
        var (user, card) = await UserWithCardAsync();
        using var _ = factory.OverrideConfig("AiSettings:ApiKey", "");

        var response = await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        await response.AssertStatusAsync(HttpStatusCode.ServiceUnavailable);
        Assert.Equal("Az MI-szolgáltatás jelenleg nem érhető el.", await response.ProblemTitleAsync());
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task MissingEndpoint_MapsTo503()
    {
        var (user, card) = await UserWithCardAsync();
        using var _ = factory.OverrideConfig("AiSettings:Endpoint", "");

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id }))
            .AssertStatusAsync(HttpStatusCode.ServiceUnavailable);
    }

    // ================= a kimenő kérés =================

    [Fact]
    public async Task Request_CarriesKeyHeadersModelAndPromptStructure()
    {
        var (user, card) = await UserWithCardAsync();
        using var referer = factory.OverrideConfig("AiSettings:HttpReferer", "http://localhost:4567");
        using var name = factory.OverrideConfig("AiSettings:AppName", "VocabApp");
        Server.Reply(new { definition = "A pet that barks." });

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.OK);

        var request = Assert.Single(Server.Requests);
        Assert.Equal("http://ai.test/v1/chat/completions", request.Url);
        Assert.Equal("Bearer test-key", request.Authorization);
        Assert.Equal("http://localhost:4567", request.Referer);
        Assert.Equal("VocabApp", request.Title);
        Assert.Equal(AiModels.Default, request.Model);
        Assert.Equal(0.2, request.Json.P("temperature").GetDouble());
        Assert.Equal(4096, request.Json.P("max_tokens").GetInt32());
        Assert.Equal("system", request.Json.P("messages")[0].P("role").GetString());
        Assert.Equal("user", request.Json.P("messages")[1].P("role").GetString());
        Assert.Equal(card.Term, request.UserJson.P("term").GetString());
        Assert.Equal("B1", request.UserJson.P("level").GetString());
    }

    [Fact]
    public async Task Request_UsesTheUsersChosenModel()
    {
        var chosen = AiModels.All[^1].Id;
        var (user, card) = await UserWithCardAsync(tweak: s => s.AiModel = chosen);
        Server.Reply(new { definition = "A pet that barks." });

        await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        Assert.Equal(chosen, Server.Requests.Single().Model);
    }

    [Fact]
    public async Task Request_FallsBackToTheDefaultModelWhenTheStoredOneIsNoLongerAllowed()
    {
        var (user, card) = await UserWithCardAsync();
        await factory.WithDbAsync(db => db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(set => set.SetProperty(u => u.AiModel, "retired/model")));
        Server.Reply(new { definition = "A pet that barks." });

        await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        Assert.Equal(AiModels.Default, Server.Requests.Single().Model);
    }

    [Fact]
    public async Task Request_CountsEveryProviderCallInTheStatistics()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { definition = "A pet that barks." });
        Server.ReplyStatus(HttpStatusCode.InternalServerError);

        await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });
        await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        Assert.Equal(2, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).AiCallCount);
    }

    // ================= a szolgáltatói válasz feldolgozása és a hibák leképezése =================

    [Fact]
    public async Task Response_CodeFencedJsonIsAccepted()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyText("```json\n{\"definition\": \"A pet that barks.\"}\n```");

        var response = await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal("A pet that barks.", (await response.ReadAsync<GenerateDefinitionResponseDto>()).Definition);
    }

    [Fact]
    public async Task Response_JsonSurroundedByChatterIsAccepted()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyText("Sure! Here you go: {\"definition\": \"A pet that barks.\"} Hope that helps.");

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Response_PropertyNamesAreCaseInsensitive()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyText("{\"Definition\": \"A pet that barks.\"}");

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Response_MessageContentGivenAsAnArrayOfPartsIsAccepted()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyEnvelope("""{"choices":[{"message":{"content":[{"type":"text","text":"{\"definition\":"},{"type":"text","text":"\"A pet that barks.\"}"}]}}]}""");

        var response = await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        await response.AssertStatusAsync(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("not json at all")]
    [InlineData("[1,2,3]")]
    [InlineData("{}")]
    [InlineData("{\"other\":\"x\"}")]
    [InlineData("")]
    public async Task Response_UnusableContent_MapsTo502(string content)
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyText(content);

        var response = await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Equal("Az MI érvénytelen választ adott.", await response.ProblemTitleAsync());
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"choices":[]}""")]
    [InlineData("""{"choices":[{"message":{}}]}""")]
    [InlineData("not json")]
    public async Task Response_BrokenEnvelope_MapsTo502(string envelope)
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyEnvelope(envelope);

        var response = await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task ProviderErrorStatus_MapsTo502(HttpStatusCode status)
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyStatus(status);

        var response = await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Equal("Hiba történt az MI-szolgáltatónál.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task ProviderNetworkFailure_MapsTo502()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyThrow(new HttpRequestException("connection refused"));

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task ProviderTimeout_MapsTo502()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyThrow(new TaskCanceledException("timeout"));

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task ProviderFailure_DoesNotLeakTheKeyOrTheProviderBodyToTheClient()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyStatus(HttpStatusCode.InternalServerError, "secret provider details test-key");

        var response = await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("test-key", body);
        Assert.DoesNotContain("secret provider details", body);
    }

    // ================= definíció =================

    [Fact]
    public async Task GenerateDefinition_Success()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { definition = "  A pet that barks.  " });

        var result = await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).ReadAsync<GenerateDefinitionResponseDto>();

        Assert.Equal("A pet that barks.", result.Definition);
        Assert.False(result.FromCard);
        Assert.False(result.Reused);
    }

    [Fact]
    public async Task GenerateDefinition_WithAlternateDefinitionsOff_ReturnsTheCardsOwnDefinitionWithoutAnAiCall()
    {
        var (user, card) = await UserWithCardAsync(definition: "the stored one", tweak: s => s.GenerateAlternateDefinitions = false);

        var result = await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).ReadAsync<GenerateDefinitionResponseDto>();

        Assert.Equal("the stored one", result.Definition);
        Assert.True(result.FromCard);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task GenerateDefinition_ForeignOrUnknownCard_Returns404WithoutAnAiCall()
    {
        var (_, card) = await UserWithCardAsync();
        var intruder = await UserAsync();

        await (await PostAsync(intruder, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await PostAsync(intruder, "/api/ai/generate/definition", new { term = "x", cardId = 99999999 })).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task GenerateDefinition_DefinitionContainingTheTerm_IsRejected()
    {
        var user = await UserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog", "x");
        Server.Reply(new { definition = "A DOG is an animal." });

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = "dog", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GenerateDefinition_ShortTermsOnlyForbidTheExactWord_NotLongerWordsStartingWithIt()
    {
        var user = await UserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "dog", "x");
        Server.Reply(new { definition = "Something about doggy things." });

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = "dog", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GenerateDefinition_LongTermsRejectDefinitionsStartingWithTheStem()
    {
        var user = await UserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "serendipity", "x");
        Server.Reply(new { definition = "A serendipitous discovery." });

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = "serendipity", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GenerateDefinition_MultiWordTermOnlyForbidsTheWholePhrase()
    {
        var user = await UserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "in the first place", "x");
        Server.Reply(new { definition = "At the very beginning, in the end of nothing." });

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = "in the first place", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GenerateDefinition_EmptyOrTooLongDefinition_IsRejected()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { definition = "   " });
        Server.Reply(new { definition = new string('x', 501) + " word" });

        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
        await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GenerateDefinition_DoesNotRetryOnAnInvalidAnswer()
    {
        var (user, card) = await UserWithCardAsync();
        Server.ReplyText("garbage");
        Server.Reply(new { definition = "A pet that barks." });

        await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id });

        Assert.Single(Server.Requests);
        Assert.Equal(1, Server.Remaining);
    }

    [Fact]
    public async Task GenerateDefinition_SavesTheDefinitionAndCanReuseItLater()
    {
        var (user, card) = await UserWithCardAsync(tweak: s => s.ReuseSavedExamples = true);
        var key = card.Term.ToLowerInvariant();
        for (var i = 0; i < 40; i++)
        {
            Server.Reply(new { definition = "A pet that barks." });
        }

        var reused = false;
        for (var i = 0; i < 40 && !reused; i++)
        {
            var result = await (await PostAsync(user, "/api/ai/generate/definition", new { term = card.Term, cardId = card.Id })).ReadAsync<GenerateDefinitionResponseDto>();
            reused = result.Reused;
            Assert.Equal("A pet that barks.", result.Definition);
        }

        Assert.True(reused);
        Assert.Equal(1, await factory.WithDbAsync(db => db.SavedDefinitions.CountAsync(item => item.TermKey == key)));
    }

    [Fact]
    public async Task GenerateDefinition_SavedDefinitionsAreSharedBetweenUsers_ButHonourTheLevelPolicy()
    {
        var term = Word();
        var first = await UserAsync(s => s.ExampleLevel = "A1");
        var card = await first.CreateCardAsync((await first.DefaultDeckAsync()).Id, term, "x");
        Server.Reply(new { definition = "An easy definition." });
        await PostAsync(first, "/api/ai/generate/definition", new { term, cardId = card.Id });

        // másik felhasználó, más szinttel és "exact" szabállyal: sosem kaphatja az A1-es mentést
        var second = await UserAsync(s =>
        {
            s.ExampleLevel = "C2";
            s.ReuseSavedExamples = true;
            s.SavedLevelPolicy = "exact";
        });
        var secondCard = await second.CreateCardAsync((await second.DefaultDeckAsync()).Id, term, "y");
        for (var i = 0; i < 10; i++)
        {
            Server.Reply(new { definition = "A hard definition." });
        }

        for (var i = 0; i < 10; i++)
        {
            var result = await (await PostAsync(second, "/api/ai/generate/definition", new { term, cardId = secondCard.Id })).ReadAsync<GenerateDefinitionResponseDto>();

            // a saját (C2) mentéseit újrahasznosíthatja, az A1-es mentést soha
            Assert.NotEqual("An easy definition.", result.Definition);
        }
    }

    // ================= pakli-szintű definíció és szintek =================

    [Fact]
    public async Task GenerateCardDefinition_Success_UsesTheDeckLevelBeforeTheAccountLevel()
    {
        var user = await UserAsync(s => s.ExampleLevel = "C1");
        var deck = await user.CreateDeckAsync();
        await user.PutJsonAsync($"/api/decks/{deck.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = "A2" });
        Server.Reply(new { definition = "A pet that barks." });

        var response = await PostAsync(user, "/api/ai/generate/card-definition", new { term = Word(), deckId = deck.Id });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal("A2", Server.Requests.Single().UserJson.P("level").GetString());
    }

    [Fact]
    public async Task GenerateCardDefinition_FallsBackToTheAccountLevel()
    {
        var user = await UserAsync(s => s.ExampleLevel = "C1");
        var deck = await user.CreateDeckAsync();
        Server.Reply(new { definition = "A pet that barks." });

        await PostAsync(user, "/api/ai/generate/card-definition", new { term = Word(), deckId = deck.Id });

        Assert.Equal("C1", Server.Requests.Single().UserJson.P("level").GetString());
    }

    [Fact]
    public async Task GenerateCardDefinition_ForeignDeck_Returns404()
    {
        var owner = await UserAsync();
        var intruder = await UserAsync();
        var deck = await owner.CreateDeckAsync();

        await (await PostAsync(intruder, "/api/ai/generate/card-definition", new { term = "x", deckId = deck.Id })).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task GenerateCardDefinition_DefinitionWithTheTermIsRejected()
    {
        var user = await UserAsync();
        var deck = await user.CreateDeckAsync();
        var term = Word();
        Server.Reply(new { definition = $"It is a {term}." });

        await (await PostAsync(user, "/api/ai/generate/card-definition", new { term, deckId = deck.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    // ================= másik definíció =================

    [Fact]
    public async Task ExtraDefinition_Disabled_ReportsWhyWithoutAnAiCall()
    {
        var (user, card) = await UserWithCardAsync(tweak: s => s.GenerateAlternateDefinitions = false);

        var result = await (await PostAsync(user, "/api/ai/generate/extra-definition", new { term = card.Term, avoidDefinition = "x", cardId = card.Id }))
            .ReadAsync<GenerateExtraDefinitionResponseDto>();

        Assert.False(result.Available);
        Assert.Equal("alternateDisabled", result.Reason);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task ExtraDefinition_DifferentWording_IsAccepted()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { definition = "Something kept at home that wags." });

        var result = await (await PostAsync(user, "/api/ai/generate/extra-definition", new { term = card.Term, avoidDefinition = "A pet that barks loudly.", cardId = card.Id }))
            .ReadAsync<GenerateExtraDefinitionResponseDto>();

        Assert.True(result.Available);
        Assert.Equal("Something kept at home that wags.", result.Definition);
        Assert.Equal("A pet that barks loudly.", Server.Requests.Single().UserJson.P("avoidDefinition").GetString());
    }

    [Fact]
    public async Task ExtraDefinition_TooSimilarFirstAnswer_IsRetriedOnce()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { definition = "A pet that barks loudly." });
        Server.Reply(new { definition = "Something kept at home that wags." });

        var result = await (await PostAsync(user, "/api/ai/generate/extra-definition", new { term = card.Term, avoidDefinition = "A pet that barks loudly.", cardId = card.Id }))
            .ReadAsync<GenerateExtraDefinitionResponseDto>();

        Assert.True(result.Available);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task ExtraDefinition_TwiceTooSimilar_ReportsNotDifferentEnough()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { definition = "A pet that barks loudly." });
        Server.Reply(new { definition = "A pet that barks loudly!" });

        var result = await (await PostAsync(user, "/api/ai/generate/extra-definition", new { term = card.Term, avoidDefinition = "A pet that barks loudly.", cardId = card.Id }))
            .ReadAsync<GenerateExtraDefinitionResponseDto>();

        Assert.False(result.Available);
        Assert.Equal("notDifferentEnough", result.Reason);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task ExtraDefinition_ForeignCard_Returns404()
    {
        var (_, card) = await UserWithCardAsync();
        var intruder = await UserAsync();

        await (await PostAsync(intruder, "/api/ai/generate/extra-definition", new { term = card.Term, avoidDefinition = "x", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    // ================= példamondat =================

    [Fact]
    public async Task GenerateExample_Success()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { example = $"I saw a {card.Term} yesterday." });

        var result = await (await PostAsync(user, "/api/ai/generate/example", new { term = card.Term, definition = "a known definition", cardId = card.Id }))
            .ReadAsync<GenerateExampleResponseDto>();

        Assert.Equal($"I saw a {card.Term} yesterday.", result.Example);
        Assert.False(result.Reused);
    }

    [Fact]
    public async Task GenerateExample_ExampleWithoutTheTerm_Returns502()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { example = "A sentence with nothing relevant." });

        await (await PostAsync(user, "/api/ai/generate/example", new { term = card.Term, definition = "d", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GenerateExample_VerbPhraseMayDropTheLeadingTo()
    {
        var user = await UserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "to jump for joy", "d");
        Server.Reply(new { example = "The children jump for joy." });

        await (await PostAsync(user, "/api/ai/generate/example", new { term = "to jump for joy", definition = "d", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GenerateExample_TermMatchIsOnWholeWordsOnly()
    {
        var user = await UserAsync();
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, "art", "d");
        Server.Reply(new { example = "The party was fun." });

        await (await PostAsync(user, "/api/ai/generate/example", new { term = "art", definition = "d", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GenerateExample_TooLong_Returns502()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { example = card.Term + " " + new string('x', 500) });

        await (await PostAsync(user, "/api/ai/generate/example", new { term = card.Term, definition = "d", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GenerateExample_IsSavedPerDefinitionAndReusedLater()
    {
        var (user, card) = await UserWithCardAsync(tweak: s => s.ReuseSavedExamples = true);
        for (var i = 0; i < 40; i++)
        {
            Server.Reply(new { example = $"Look at the {card.Term} there." });
        }

        var reused = false;
        for (var i = 0; i < 40 && !reused; i++)
        {
            var result = await (await PostAsync(user, "/api/ai/generate/example", new { term = card.Term, definition = "same definition", cardId = card.Id })).ReadAsync<GenerateExampleResponseDto>();
            reused = result.Reused;
        }

        Assert.True(reused);
        var key = card.Term.ToLowerInvariant();
        Assert.Equal(1, await factory.WithDbAsync(db => db.SavedExamples.CountAsync(item => item.TermKey == key)));
    }

    [Fact]
    public async Task GenerateExample_ForeignCard_Returns404()
    {
        var (_, card) = await UserWithCardAsync();
        var intruder = await UserAsync();

        await (await PostAsync(intruder, "/api/ai/generate/example", new { term = card.Term, definition = "d", cardId = card.Id })).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    // ================= magyar jelentés =================

    [Fact]
    public async Task TargetMeaning_Success_IsCachedForTheSameTermAndDefinition()
    {
        var user = await UserAsync();
        var term = Word();
        Server.Reply(new { meanings = "kutya, eb" });

        var first = await (await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "an animal" })).ReadAsync<GenerateTargetMeaningResponseDto>();
        var second = await (await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "an animal" })).ReadAsync<GenerateTargetMeaningResponseDto>();

        Assert.Equal("kutya, eb", first.Meanings);
        Assert.Equal("kutya, eb", second.Meanings);
        Assert.Single(Server.Requests);
    }

    [Fact]
    public async Task TargetMeaning_CacheIsPerModelAndPerDefinition()
    {
        var user = await UserAsync();
        var term = Word();
        Server.Reply(new { meanings = "első" });
        Server.Reply(new { meanings = "második" });
        Server.Reply(new { meanings = "harmadik" });

        await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "one meaning" });
        await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "other meaning" });
        await user.SaveSettingsAsync(s => s.AiModel = AiModels.All[1].Id);
        await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "one meaning" });

        Assert.Equal(3, Server.Requests.Count);
    }

    [Fact]
    public async Task TargetMeaning_CacheIsSharedBetweenUsersOfTheSameModel()
    {
        var term = Word();
        var first = await UserAsync();
        var second = await UserAsync();
        Server.Reply(new { meanings = "közös" });

        await PostAsync(first, "/api/ai/generate/target-meaning", new { term, definition = "d" });
        var result = await (await PostAsync(second, "/api/ai/generate/target-meaning", new { term, definition = "d" })).ReadAsync<GenerateTargetMeaningResponseDto>();

        Assert.Equal("közös", result.Meanings);
        Assert.Single(Server.Requests);
    }

    [Fact]
    public async Task TargetMeaning_PartsContainingTheEnglishTermAreDropped()
    {
        var user = await UserAsync();
        var term = Word();
        Server.Reply(new { meanings = $"fedezeti alap; {term} fund, kockázati tőke" });

        var result = await (await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "d" })).ReadAsync<GenerateTargetMeaningResponseDto>();

        Assert.Equal("fedezeti alap, kockázati tőke", result.Meanings);
    }

    [Fact]
    public async Task TargetMeaning_OnlyEnglishTermParts_IsRetriedOnceThenFails()
    {
        var user = await UserAsync();
        var term = Word();
        Server.Reply(new { meanings = term });
        Server.Reply(new { meanings = term });

        var response = await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "d" });

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task TargetMeaning_RetrySucceedsAfterAnInvalidFirstAnswer()
    {
        var user = await UserAsync();
        var term = Word();
        Server.ReplyText("oops");
        Server.Reply(new { meanings = "kutya" });

        var response = await PostAsync(user, "/api/ai/generate/target-meaning", new { term, definition = "d" });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task TargetMeaning_ProviderErrorIsNotRetried()
    {
        var user = await UserAsync();
        Server.ReplyStatus(HttpStatusCode.InternalServerError);
        Server.Reply(new { meanings = "kutya" });

        await (await PostAsync(user, "/api/ai/generate/target-meaning", new { term = Word(), definition = "d" })).AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Single(Server.Requests);
    }

    [Fact]
    public async Task TargetMeaning_TooLong_Returns502()
    {
        var user = await UserAsync();
        Server.Reply(new { meanings = new string('á', 301) });
        Server.Reply(new { meanings = new string('á', 301) });

        await (await PostAsync(user, "/api/ai/generate/target-meaning", new { term = Word(), definition = "d" })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    // ================= válasz ellenőrzése =================

    private static object ValidateBody(string term = "dog", bool paraphrase = false, bool toEnglish = false) =>
        new { term, definition = "an animal that barks", answer = "a pet", paraphrase, toEnglish };

    [Fact]
    public async Task Validate_CorrectAnswer_NeedsNoFeedback()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = true, feedback = "" });

        var result = await (await PostAsync(user, "/api/ai/validate", ValidateBody())).ReadAsync<ValidateAnswerResponseDto>();

        Assert.True(result.IsCorrect);
        Assert.False(result.IsSynonym);
        Assert.Equal(string.Empty, result.Feedback);
        var prompt = Server.Requests.Single();
        Assert.Equal("dog", prompt.UserJson.P("term").GetString());
        Assert.Equal("an animal that barks", prompt.UserJson.P("referenceDefinition").GetString());
        Assert.Equal("a pet", prompt.UserJson.P("learnerAnswer").GetString());
    }

    [Fact]
    public async Task Validate_WrongAnswer_ReturnsTheHungarianFeedback()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = false, feedback = "  Nem egészen.  " });

        var result = await (await PostAsync(user, "/api/ai/validate", ValidateBody())).ReadAsync<ValidateAnswerResponseDto>();

        Assert.False(result.IsCorrect);
        Assert.Equal("Nem egészen.", result.Feedback);
    }

    [Fact]
    public async Task Validate_WrongAnswerWithoutFeedback_IsRetriedOnceAndThenRejected()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = false, feedback = "" });
        Server.Reply(new { isCorrect = false, feedback = "   " });

        var response = await PostAsync(user, "/api/ai/validate", ValidateBody());

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task Validate_SecondAttemptCanRescueAnInvalidFirstOne()
    {
        var user = await UserAsync();
        Server.ReplyText("not json");
        Server.Reply(new { isCorrect = false, feedback = "Hibás." });

        var response = await PostAsync(user, "/api/ai/validate", ValidateBody());

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task Validate_FeedbackLongerThan500_IsRejected()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = true, feedback = new string('x', 501) });
        Server.Reply(new { isCorrect = true, feedback = new string('x', 501) });

        await (await PostAsync(user, "/api/ai/validate", ValidateBody())).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task Validate_ProviderErrorIsNotRetried()
    {
        var user = await UserAsync();
        Server.ReplyStatus(HttpStatusCode.InternalServerError);
        Server.Reply(new { isCorrect = true, feedback = "" });

        await (await PostAsync(user, "/api/ai/validate", ValidateBody())).AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Single(Server.Requests);
    }

    [Fact]
    public async Task Validate_ToEnglishRequiresTheSynonymFlagAndReportsSynonyms()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = false, isSynonym = true, feedback = "Ez egy szinonima." });

        var result = await (await PostAsync(user, "/api/ai/validate", ValidateBody(toEnglish: true))).ReadAsync<ValidateAnswerResponseDto>();

        Assert.False(result.IsCorrect);
        Assert.True(result.IsSynonym);
        Assert.Contains("isSynonym", Server.Requests.Single().SystemPrompt);
    }

    [Fact]
    public async Task Validate_ToEnglishWithoutTheSynonymFlag_IsAnInvalidAnswer()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = true, feedback = "" });
        Server.Reply(new { isCorrect = true, feedback = "" });

        await (await PostAsync(user, "/api/ai/validate", ValidateBody(toEnglish: true))).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task Validate_SynonymIsAcceptedOnlyWhenTheUserAllowsIt()
    {
        var strict = await UserAsync(s => s.AcceptEnglishSynonyms = false);
        var lenient = await UserAsync(s => s.AcceptEnglishSynonyms = true);
        Server.Reply(new { isCorrect = false, isSynonym = true, feedback = "Szinonima." });
        Server.Reply(new { isCorrect = false, isSynonym = true, feedback = "Szinonima." });

        var strictResult = await (await PostAsync(strict, "/api/ai/validate", ValidateBody(toEnglish: true))).ReadAsync<ValidateAnswerResponseDto>();
        var lenientResult = await (await PostAsync(lenient, "/api/ai/validate", ValidateBody(toEnglish: true))).ReadAsync<ValidateAnswerResponseDto>();

        Assert.False(strictResult.IsCorrect);
        Assert.True(lenientResult.IsCorrect);
        Assert.True(lenientResult.IsSynonym);
    }

    [Fact]
    public async Task Validate_CorrectAnswerIsNeverMarkedAsSynonym()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = true, isSynonym = true, feedback = "" });

        var result = await (await PostAsync(user, "/api/ai/validate", ValidateBody(toEnglish: true))).ReadAsync<ValidateAnswerResponseDto>();

        Assert.True(result.IsCorrect);
        Assert.False(result.IsSynonym);
    }

    [Fact]
    public async Task Validate_ParaphraseKeepsTheEnglishRewriteOnlyWhenHungarianIsAccepted()
    {
        var allowed = await UserAsync(s => s.AcceptHungarianParaphrase = true);
        var english = await UserAsync(s => s.AcceptHungarianParaphrase = false);
        Server.Reply(new { isCorrect = true, feedback = "", englishAnswer = "A pet that purrs." });
        Server.Reply(new { isCorrect = true, feedback = "", englishAnswer = "A pet that purrs." });

        var kept = await (await PostAsync(allowed, "/api/ai/validate", ValidateBody(paraphrase: true))).ReadAsync<ValidateAnswerResponseDto>();
        var dropped = await (await PostAsync(english, "/api/ai/validate", ValidateBody(paraphrase: true))).ReadAsync<ValidateAnswerResponseDto>();

        Assert.Equal("A pet that purrs.", kept.EnglishAnswer);
        Assert.Equal(string.Empty, dropped.EnglishAnswer);
        Assert.Contains("English or Hungarian", Server.Requests[0].SystemPrompt);
        Assert.Contains("must answer in English", Server.Requests[1].SystemPrompt);
    }

    [Fact]
    public async Task Validate_ParaphraseRewriteIsDroppedForWrongAnswers()
    {
        var user = await UserAsync(s => s.AcceptHungarianParaphrase = true);
        Server.Reply(new { isCorrect = false, feedback = "Nem.", englishAnswer = "leftover" });

        var result = await (await PostAsync(user, "/api/ai/validate", ValidateBody(paraphrase: true))).ReadAsync<ValidateAnswerResponseDto>();

        Assert.Equal(string.Empty, result.EnglishAnswer);
    }

    [Fact]
    public async Task Validate_ParaphraseRewriteLongerThan500IsRejected()
    {
        var user = await UserAsync(s => s.AcceptHungarianParaphrase = true);
        Server.Reply(new { isCorrect = true, feedback = "", englishAnswer = new string('x', 501) });
        Server.Reply(new { isCorrect = true, feedback = "", englishAnswer = new string('x', 501) });

        await (await PostAsync(user, "/api/ai/validate", ValidateBody(paraphrase: true))).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Theory]
    [InlineData("term")]
    [InlineData("definition")]
    [InlineData("answer")]
    public async Task Validate_MissingRequiredText_Returns400(string field)
    {
        var user = await UserAsync();
        var body = new Dictionary<string, object> { ["term"] = "dog", ["definition"] = "d", ["answer"] = "a" };
        body.Remove(field);

        var response = await PostAsync(user, "/api/ai/validate", body);

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("A megadott adatok hiányosak vagy érvénytelenek.", await response.ProblemTitleAsync());
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task Validate_FieldLengthLimits()
    {
        var user = await UserAsync();
        Server.Reply(new { isCorrect = true, feedback = "" });

        var atLimit = await PostAsync(user, "/api/ai/validate", new { term = new string('t', 100), definition = new string('d', 500), answer = new string('a', 1000) });
        var longTerm = await PostAsync(user, "/api/ai/validate", new { term = new string('t', 101), definition = "d", answer = "a" });
        var longDefinition = await PostAsync(user, "/api/ai/validate", new { term = "t", definition = new string('d', 501), answer = "a" });
        var longAnswer = await PostAsync(user, "/api/ai/validate", new { term = "t", definition = "d", answer = new string('a', 1001) });

        await atLimit.AssertStatusAsync(HttpStatusCode.OK);
        await longTerm.AssertStatusAsync(HttpStatusCode.BadRequest);
        await longDefinition.AssertStatusAsync(HttpStatusCode.BadRequest);
        await longAnswer.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Single(Server.Requests);
    }

    // ================= fellebbezés =================

    [Fact]
    public async Task Appeal_Accepted()
    {
        var user = await UserAsync();
        Server.Reply(new { accepted = true, feedback = "" });

        var result = await (await PostAsync(user, "/api/ai/appeal-answer", new { term = "dog", definition = "d", answer = "a", reason = "because" })).ReadAsync<AppealAnswerResponseDto>();

        Assert.True(result.Accepted);
    }

    [Fact]
    public async Task Appeal_PassesThePreviousFeedbackAndTheJustification()
    {
        var user = await UserAsync();
        Server.Reply(new { accepted = false, feedback = "Még mindig nem." });

        var result = await (await PostAsync(user, "/api/ai/appeal-answer", new
        {
            term = "dog",
            definition = "d",
            answer = "a",
            reason = "  mert igen  ",
            previousFeedback = " Az első elutasítás. "
        })).ReadAsync<AppealAnswerResponseDto>();

        Assert.False(result.Accepted);
        Assert.Equal("Még mindig nem.", result.Feedback);
        var user_ = Server.Requests.Single().UserJson;
        Assert.Equal("mert igen", user_.P("justification").GetString());
        Assert.Equal("Az első elutasítás.", user_.P("previousFeedback").GetString());
    }

    [Fact]
    public async Task Appeal_BlankPreviousFeedbackIsSentAsNull()
    {
        var user = await UserAsync();
        Server.Reply(new { accepted = true, feedback = "" });

        await PostAsync(user, "/api/ai/appeal-answer", new { term = "dog", definition = "d", answer = "a", reason = "r", previousFeedback = "   " });

        Assert.Equal(JsonValueKind.Null, Server.Requests.Single().UserJson.P("previousFeedback").ValueKind);
    }

    [Fact]
    public async Task Appeal_RejectionWithoutFeedback_IsInvalid()
    {
        var user = await UserAsync();
        Server.Reply(new { accepted = false, feedback = "" });
        Server.Reply(new { accepted = false, feedback = "" });

        await (await PostAsync(user, "/api/ai/appeal-answer", new { term = "dog", definition = "d", answer = "a", reason = "r" }))
            .AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Appeal_BlankReason_Returns400(string reason)
    {
        var user = await UserAsync();

        var response = await PostAsync(user, "/api/ai/appeal-answer", new { term = "dog", definition = "d", answer = "a", reason });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task Appeal_PreviousFeedbackLongerThan500_Returns400()
    {
        var user = await UserAsync();

        await (await PostAsync(user, "/api/ai/appeal-answer", new { term = "dog", definition = "d", answer = "a", reason = "r", previousFeedback = new string('x', 501) }))
            .AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    // ================= magyarázat =================

    [Fact]
    public async Task Explain_OnTopic_ReturnsTheText()
    {
        var user = await UserAsync();
        Server.Reply(new { onTopic = true, text = "  A válaszod közel van.  " });

        var result = await (await PostAsync(user, "/api/ai/explain-answer", new { term = "dog", definition = "d", answer = "a" })).ReadAsync<ExplainAnswerResponseDto>();

        Assert.True(result.OnTopic);
        Assert.Equal("A válaszod közel van.", result.Text);
    }

    [Fact]
    public async Task Explain_OffTopic_AlwaysReturnsTheFixedRefusal()
    {
        var user = await UserAsync();
        Server.Reply(new { onTopic = false, text = "Something else entirely" });

        var result = await (await PostAsync(user, "/api/ai/explain-answer", new { term = "dog", definition = "d", answer = "a" })).ReadAsync<ExplainAnswerResponseDto>();

        Assert.False(result.OnTopic);
        Assert.Equal("Ez nem kapcsolódik a tárgyhoz.", result.Text);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Explain_EmptyTextOnTopic_IsInvalid(string text)
    {
        var user = await UserAsync();
        Server.Reply(new { onTopic = true, text });
        Server.Reply(new { onTopic = true, text });

        await (await PostAsync(user, "/api/ai/explain-answer", new { term = "dog", definition = "d", answer = "a" })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task Explain_TextLongerThan1500_IsInvalid()
    {
        var user = await UserAsync();
        Server.Reply(new { onTopic = true, text = new string('x', 1501) });
        Server.Reply(new { onTopic = true, text = new string('x', 1501) });

        await (await PostAsync(user, "/api/ai/explain-answer", new { term = "dog", definition = "d", answer = "a" })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task Explain_OnlyTheLastEightMessagesAreSent_WithNormalizedRoles()
    {
        var user = await UserAsync();
        Server.Reply(new { onTopic = true, text = "ok" });
        var messages = Enumerable.Range(0, 10)
            .Select(i => new { role = i % 2 == 0 ? " USER " : "Assistant", content = $"message {i}" })
            .ToList();

        await PostAsync(user, "/api/ai/explain-answer", new { term = "dog", definition = "d", answer = "a", messages });

        var sent = Server.Requests.Single().UserJson.P("messages");
        Assert.Equal(8, sent.GetArrayLength());
        Assert.Equal("message 2", sent[0].P("content").GetString());
        Assert.Equal("user", sent[0].P("role").GetString());
        Assert.Equal("assistant", sent[1].P("role").GetString());
    }

    [Theory]
    [InlineData("system", "hello")]
    [InlineData("", "hello")]
    [InlineData("user", "")]
    [InlineData("user", "   ")]
    public async Task Explain_InvalidMessage_Returns400(string role, string content)
    {
        var user = await UserAsync();

        var response = await PostAsync(user, "/api/ai/explain-answer", new { term = "dog", definition = "d", answer = "a", messages = new[] { new { role, content } } });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task Explain_MessageContentLongerThan2000_Returns400()
    {
        var user = await UserAsync();

        await (await PostAsync(user, "/api/ai/explain-answer", new { term = "dog", definition = "d", answer = "a", messages = new[] { new { role = "user", content = new string('x', 2001) } } }))
            .AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    // ================= felismerés (kétértelműség) =================

    [Fact]
    public async Task RecognizeAmbiguity_GuessEqualToTheTerm_NeedsNoAiCall()
    {
        var (user, card) = await UserWithCardAsync(term: "Ice  Cream");

        var result = await (await PostAsync(user, "/api/ai/recognize-ambiguity", new { cardId = card.Id, definition = "frozen dessert", guess = "  ice cream " }))
            .ReadAsync<RecognizeAmbiguityResponseDto>();

        Assert.True(result.MatchesTerm);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task RecognizeAmbiguity_DefinitionDoesNotFitTheGuess_IsASingleCall()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { fitsGuess = false });

        var result = await (await PostAsync(user, "/api/ai/recognize-ambiguity", new { cardId = card.Id, definition = "an animal", guess = "table" }))
            .ReadAsync<RecognizeAmbiguityResponseDto>();

        Assert.False(result.MatchesTerm);
        Assert.False(result.FitsGuess);
        Assert.Null(result.Hint);
        Assert.Single(Server.Requests);
    }

    [Fact]
    public async Task RecognizeAmbiguity_FittingGuessGetsANarrowingHint_AndTheHintIsSaved()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { fitsGuess = true });
        Server.Reply(new { definition = "A small furry creature that purrs." });

        var result = await (await PostAsync(user, "/api/ai/recognize-ambiguity", new { cardId = card.Id, definition = "an animal people keep", guess = "dog" }))
            .ReadAsync<RecognizeAmbiguityResponseDto>();

        Assert.True(result.FitsGuess);
        Assert.Equal("A small furry creature that purrs.", result.Hint);
        Assert.Equal(2, Server.Requests.Count);
        var key = card.Term.ToLowerInvariant();
        Assert.Equal(1, await factory.WithDbAsync(db => db.SavedDefinitions.CountAsync(item => item.TermKey == key)));
    }

    [Fact]
    public async Task RecognizeAmbiguity_HintMentioningTheGuessIsRetriedAndThenDropped()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { fitsGuess = true });
        Server.Reply(new { definition = "Not a dog but a small furry creature." });
        Server.Reply(new { definition = "Unlike a dog it purrs." });

        var result = await (await PostAsync(user, "/api/ai/recognize-ambiguity", new { cardId = card.Id, definition = "an animal people keep", guess = "dog" }))
            .ReadAsync<RecognizeAmbiguityResponseDto>();

        Assert.True(result.FitsGuess);
        Assert.Null(result.Hint);
        Assert.Equal(3, Server.Requests.Count);
    }

    [Fact]
    public async Task RecognizeAmbiguity_HintFailureIsToleratedOnTheFirstAttempt()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { fitsGuess = true });
        Server.ReplyStatus(HttpStatusCode.InternalServerError);
        Server.Reply(new { definition = "A small furry creature that purrs." });

        var result = await (await PostAsync(user, "/api/ai/recognize-ambiguity", new { cardId = card.Id, definition = "an animal people keep", guess = "dog" }))
            .ReadAsync<RecognizeAmbiguityResponseDto>();

        Assert.Equal("A small furry creature that purrs.", result.Hint);
    }

    [Fact]
    public async Task RecognizeAmbiguity_ForeignCard_Returns404()
    {
        var (_, card) = await UserWithCardAsync();
        var intruder = await UserAsync();

        await (await PostAsync(intruder, "/api/ai/recognize-ambiguity", new { cardId = card.Id, definition = "d", guess = "g" })).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(Server.Requests);
    }

    // ================= Nyelvtan =================

    private static object GrammarOk(bool term = true, bool tense = true, bool grammar = true, string feedback = "", string corrected = "") =>
        new { termUsedCorrectly = term, tenseCorrect = tense, grammarCorrect = grammar, feedback, correctedSentence = corrected };

    [Fact]
    public async Task GrammarCheck_AllCorrect_IsComputedByTheServer_AndRecorded()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(GrammarOk(corrected: "ignored"));

        var response = await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = "  The dog barked.  " });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<GrammarCheckResponseDto>();
        Assert.True(result.IsCorrect);
        Assert.Equal(string.Empty, result.CorrectedSentence); // helyes válasznál nincs javított mondat
        Assert.True(result.AttemptId > 0);
        var sent = Server.Requests.Single().UserJson;
        Assert.Equal("The dog barked.", sent.P("sentence").GetString());
        Assert.Contains("past simple", sent.P("tense").GetString());
        Assert.Equal(card.Term, sent.P("term").GetString());
        Assert.Equal(1, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.AttemptCount);
    }

    [Theory]
    [InlineData(false, true, true)]
    [InlineData(true, false, true)]
    [InlineData(true, true, false)]
    public async Task GrammarCheck_AnyFailedJudgementMakesTheAttemptIncorrect_EvenIfTheAiSaidOtherwise(bool term, bool tense, bool grammar)
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(GrammarOk(term, tense, grammar, feedback: "Hiba.", corrected: "Fixed."));

        var result = await (await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = "x" })).ReadAsync<GrammarCheckResponseDto>();

        Assert.False(result.IsCorrect);
        Assert.Equal("Fixed.", result.CorrectedSentence);
        Assert.Equal((term, tense, grammar), (result.TermUsedCorrectly, result.TenseCorrect, result.GrammarCorrect));
    }

    [Fact]
    public async Task GrammarCheck_IncorrectWithoutFeedback_IsRetriedThenRejected_AndNothingIsRecorded()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(GrammarOk(grammar: false));
        Server.Reply(GrammarOk(grammar: false));

        var response = await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = "x" });

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Equal(2, Server.Requests.Count);
        Assert.Equal(0, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.AttemptCount);
    }

    [Fact]
    public async Task GrammarCheck_WithTranslationEnabled_AsksForAndReturnsTheHungarianTranslation()
    {
        var (user, card) = await UserWithCardAsync();
        await user.PutJsonAsync("/api/grammar/translation", new GrammarTranslationDto { Enabled = true });
        Server.Reply(new { termUsedCorrectly = true, tenseCorrect = true, grammarCorrect = true, feedback = "", correctedSentence = "", hungarianTranslation = "A kutya ugatott." });

        var result = await (await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = "x" })).ReadAsync<GrammarCheckResponseDto>();

        Assert.Equal("A kutya ugatott.", result.HungarianTranslation);
        Assert.Contains("hungarianTranslation", Server.Requests.Single().SystemPrompt);
    }

    [Fact]
    public async Task GrammarCheck_WithTranslationEnabledButNoTranslation_IsInvalid()
    {
        var (user, card) = await UserWithCardAsync();
        await user.PutJsonAsync("/api/grammar/translation", new GrammarTranslationDto { Enabled = true });
        Server.Reply(new { termUsedCorrectly = true, tenseCorrect = true, grammarCorrect = true, feedback = "", correctedSentence = "", hungarianTranslation = "  " });
        Server.Reply(new { termUsedCorrectly = true, tenseCorrect = true, grammarCorrect = true, feedback = "", correctedSentence = "", hungarianTranslation = "" });

        await (await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = "x" })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GrammarCheck_WithTranslationDisabled_NeverReturnsOne()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(GrammarOk());

        var result = await (await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = "x" })).ReadAsync<GrammarCheckResponseDto>();

        Assert.Equal(string.Empty, result.HungarianTranslation);
        Assert.DoesNotContain("hungarianTranslation", Server.Requests.Single().SystemPrompt);
    }

    [Fact]
    public async Task GrammarCheck_ForeignCard_Returns404_AndRecordsNothing()
    {
        var (owner, card) = await UserWithCardAsync();
        var intruder = await UserAsync();

        await (await PostAsync(intruder, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = "x" })).AssertStatusAsync(HttpStatusCode.NotFound);

        Assert.Empty(Server.Requests);
        Assert.Equal(0, (await intruder.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.AttemptCount);
        Assert.Equal(0, (await owner.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Grammar.AttemptCount);
    }

    [Theory]
    [InlineData("future")]
    [InlineData("")]
    [InlineData("PAST_SIMPLE")]
    public async Task GrammarCheck_UnknownTense_Returns400WithoutAnAiCall(string tense)
    {
        var (user, card) = await UserWithCardAsync();

        var response = await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense, sentence = "x" });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task GrammarCheck_SentenceLimit300()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(GrammarOk());

        await (await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = new string('x', 300) })).AssertStatusAsync(HttpStatusCode.OK);
        await (await PostAsync(user, "/api/ai/grammar/check", new { cardId = card.Id, tense = "past_simple", sentence = new string('x', 301) })).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task GrammarExample_Success_AndNotSavedAsAReusableExample()
    {
        var (user, card) = await UserWithCardAsync(tweak: s => s.ReuseSavedExamples = true);
        Server.Reply(new { example = "Yesterday the dog barked." });

        var result = await (await PostAsync(user, "/api/ai/grammar/example", new { cardId = card.Id, tense = "past_simple" })).ReadAsync<GrammarExampleResponseDto>();

        Assert.Equal("Yesterday the dog barked.", result.Example);
        var key = card.Term.ToLowerInvariant();
        Assert.Equal(0, await factory.WithDbAsync(db => db.SavedExamples.CountAsync(item => item.TermKey == key)));
    }

    [Fact]
    public async Task GrammarExample_EmptyOrTooLong_IsInvalid()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { example = " " });
        Server.Reply(new { example = new string('x', 501) });

        await (await PostAsync(user, "/api/ai/grammar/example", new { cardId = card.Id, tense = "past_simple" })).AssertStatusAsync(HttpStatusCode.BadGateway);
        await (await PostAsync(user, "/api/ai/grammar/example", new { cardId = card.Id, tense = "past_simple" })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task GrammarExampleAndHint_ForeignCardOrUnknownTense()
    {
        var (_, card) = await UserWithCardAsync();
        var intruder = await UserAsync();

        await (await PostAsync(intruder, "/api/ai/grammar/example", new { cardId = card.Id, tense = "past_simple" })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await PostAsync(intruder, "/api/ai/grammar/hint", new { cardId = card.Id, tense = "past_simple" })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await PostAsync(intruder, "/api/ai/grammar/example", new { cardId = card.Id, tense = "nonsense" })).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await PostAsync(intruder, "/api/ai/grammar/hint", new { cardId = card.Id, tense = "nonsense" })).AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task GrammarHint_Success_SendsTheTargetMeaningsAndLevel()
    {
        var user = await UserAsync(s => s.ExampleLevel = "A2");
        var card = await user.CreateCardAsync((await user.DefaultDeckAsync()).Id, Word(), "d", targetMeanings: "kutya, eb");
        Server.Reply(new { sentence = "Tegnap a kutya ugatott." });

        var result = await (await PostAsync(user, "/api/ai/grammar/hint", new { cardId = card.Id, tense = "past_simple" })).ReadAsync<GrammarHintResponseDto>();

        Assert.Equal("Tegnap a kutya ugatott.", result.Sentence);
        var sent = Server.Requests.Single().UserJson;
        Assert.Equal("kutya, eb", sent.P("targetMeanings").GetString());
        Assert.Equal("A2", sent.P("level").GetString());
    }

    [Fact]
    public async Task GrammarHint_TooLong_IsInvalid()
    {
        var (user, card) = await UserWithCardAsync();
        Server.Reply(new { sentence = new string('x', 301) });

        await (await PostAsync(user, "/api/ai/grammar/hint", new { cardId = card.Id, tense = "past_simple" })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    // ================= Mondatok =================

    private static object CompositionOk(int count, Func<int, bool>? used = null, bool grammar = true, bool coherent = true, string feedback = "", string corrected = "") =>
        new
        {
            words = Enumerable.Range(0, count).Select(i => new { index = i, usedCorrectly = used?.Invoke(i) ?? true }),
            grammarCorrect = grammar,
            coherent,
            feedback,
            correctedText = corrected
        };

    private async Task<(TestUser User, List<CardDto> Cards)> UserWithCardsAsync(int count = 3, Action<StudySettingsDto>? tweak = null)
    {
        var user = await UserAsync(tweak);
        return (user, await user.CreateCardsAsync((await user.DefaultDeckAsync()).Id, count, "w" + Guid.NewGuid().ToString("N")[..6]));
    }

    [Fact]
    public async Task CompositionCheck_AllCorrect_KeepsTheRequestOrderAndRecordsTheAttempt()
    {
        var (user, cards) = await UserWithCardsAsync(3);
        var ids = cards.Select(c => c.Id).Reverse().ToList(); // szándékosan fordított sorrend
        Server.Reply(CompositionOk(3, corrected: "ignored"));

        var response = await PostAsync(user, "/api/ai/composition/check", new { cardIds = ids, text = " A text. " });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<CompositionCheckResponseDto>();
        Assert.True(result.IsCorrect);
        Assert.Equal(ids, result.Words.Select(w => w.CardId));
        Assert.Equal(cards.Select(c => c.Term).Reverse(), result.Words.Select(w => w.Term));
        Assert.Equal(string.Empty, result.CorrectedText);
        Assert.True(result.AttemptId > 0);
        Assert.Equal("A text.", Server.Requests.Single().UserJson.P("text").GetString());
        Assert.Equal(1, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Composition.AttemptCount);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public async Task CompositionCheck_AWrongWordOrCoherenceMakesItIncorrect(bool allWordsOk, bool coherent)
    {
        var (user, cards) = await UserWithCardsAsync(2);
        Server.Reply(CompositionOk(2, i => allWordsOk || i != 1, coherent: coherent, feedback: "Hiba.", corrected: "Fixed."));

        var result = await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = cards.Select(c => c.Id), text = "x" })).ReadAsync<CompositionCheckResponseDto>();

        Assert.False(result.IsCorrect);
        Assert.Equal("Fixed.", result.CorrectedText);
    }

    [Fact]
    public async Task CompositionCheck_GrammarMistakeMakesItIncorrect()
    {
        var (user, cards) = await UserWithCardsAsync(2);
        Server.Reply(CompositionOk(2, grammar: false, feedback: "Nyelvtani hiba."));

        var result = await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = cards.Select(c => c.Id), text = "x" })).ReadAsync<CompositionCheckResponseDto>();

        Assert.False(result.IsCorrect);
        Assert.False(result.GrammarCorrect);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("duplicate")]
    [InlineData("extra")]
    [InlineData("outOfRange")]
    public async Task CompositionCheck_AWordVerdictListThatDoesNotMatchTheTask_IsInvalid(string defect)
    {
        var (user, cards) = await UserWithCardsAsync(3);
        object Broken(int count) => defect switch
        {
            "missing" => new { words = new[] { new { index = 0, usedCorrectly = true }, new { index = 1, usedCorrectly = true } }, grammarCorrect = true, coherent = true, feedback = "", correctedText = "" },
            "duplicate" => new { words = new[] { new { index = 0, usedCorrectly = true }, new { index = 0, usedCorrectly = true }, new { index = 2, usedCorrectly = true } }, grammarCorrect = true, coherent = true, feedback = "", correctedText = "" },
            "extra" => CompositionOk(4),
            _ => new { words = new[] { new { index = 1, usedCorrectly = true }, new { index = 2, usedCorrectly = true }, new { index = 3, usedCorrectly = true } }, grammarCorrect = true, coherent = true, feedback = "", correctedText = "" }
        };
        Server.Reply(Broken(3));
        Server.Reply(Broken(3));

        var response = await PostAsync(user, "/api/ai/composition/check", new { cardIds = cards.Select(c => c.Id), text = "x" });

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Equal(2, Server.Requests.Count);
        Assert.Equal(0, (await user.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Composition.AttemptCount);
    }

    [Fact]
    public async Task CompositionCheck_RetriesOnceAfterAnInvalidAnswer()
    {
        var (user, cards) = await UserWithCardsAsync(2);
        Server.ReplyText("nonsense");
        Server.Reply(CompositionOk(2));

        await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = cards.Select(c => c.Id), text = "x" })).AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task CompositionCheck_IncorrectWithoutFeedback_IsInvalid()
    {
        var (user, cards) = await UserWithCardsAsync(2);
        Server.Reply(CompositionOk(2, coherent: false));
        Server.Reply(CompositionOk(2, coherent: false));

        await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = cards.Select(c => c.Id), text = "x" })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task CompositionCheck_WithTranslation()
    {
        var (user, cards) = await UserWithCardsAsync(2);
        await user.PutJsonAsync("/api/grammar/translation", new GrammarTranslationDto { Enabled = true });
        Server.Reply(new
        {
            words = new[] { new { index = 0, usedCorrectly = true }, new { index = 1, usedCorrectly = true } },
            grammarCorrect = true,
            coherent = true,
            feedback = "",
            correctedText = "",
            hungarianTranslation = "Egy szöveg."
        });

        var result = await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = cards.Select(c => c.Id), text = "x" })).ReadAsync<CompositionCheckResponseDto>();

        Assert.Equal("Egy szöveg.", result.HungarianTranslation);
    }

    [Fact]
    public async Task CompositionCheck_ForeignOrUnknownCard_Returns404_AndRecordsNothing()
    {
        var (owner, cards) = await UserWithCardsAsync(2);
        var intruder = await UserAsync();
        var mine = await intruder.CreateCardAsync((await intruder.DefaultDeckAsync()).Id, "mine", "d");

        await (await PostAsync(intruder, "/api/ai/composition/check", new { cardIds = new[] { cards[0].Id, mine.Id }, text = "x" })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await PostAsync(intruder, "/api/ai/composition/check", new { cardIds = new[] { mine.Id, 99999999 }, text = "x" })).AssertStatusAsync(HttpStatusCode.NotFound);

        Assert.Empty(Server.Requests);
        Assert.Equal(0, (await owner.GetAsync<StudyStatsDto>("/api/study/stats")).Practice.Composition.AttemptCount);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(6)]
    public async Task CompositionEndpoints_RequireTwoToFiveWords(int count)
    {
        var user = await UserAsync();
        var ids = Enumerable.Range(1, count).ToList();

        await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = ids, text = "x" })).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await PostAsync(user, "/api/ai/composition/example", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await PostAsync(user, "/api/ai/composition/hint", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task CompositionEndpoints_RejectDuplicateAndNonPositiveIds()
    {
        var user = await UserAsync();

        foreach (var ids in new[] { new[] { 5, 5 }, new[] { 0, 7 }, new[] { -1, 7 } })
        {
            await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = ids, text = "x" })).AssertStatusAsync(HttpStatusCode.BadRequest);
            await (await PostAsync(user, "/api/ai/composition/example", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.BadRequest);
            await (await PostAsync(user, "/api/ai/composition/hint", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.BadRequest);
        }

        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task CompositionCheck_TextLimit500()
    {
        var (user, cards) = await UserWithCardsAsync(2);
        Server.Reply(CompositionOk(2));
        var ids = cards.Select(c => c.Id).ToList();

        await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = ids, text = new string('x', 500) })).AssertStatusAsync(HttpStatusCode.OK);
        await (await PostAsync(user, "/api/ai/composition/check", new { cardIds = ids, text = new string('x', 501) })).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CompositionExampleAndHint_Success_UseTheSharedDeckLevel()
    {
        var user = await UserAsync(s => s.ExampleLevel = "C2");
        var deck = await user.CreateDeckAsync();
        await user.PutJsonAsync($"/api/decks/{deck.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = "A1" });
        var cards = await user.CreateCardsAsync(deck.Id, 2);
        var ids = cards.Select(c => c.Id).ToList();
        Server.Reply(new { example = "The dog sat." });
        Server.Reply(new { text = "A kutya leült." });

        var example = await (await PostAsync(user, "/api/ai/composition/example", new { cardIds = ids })).ReadAsync<CompositionExampleResponseDto>();
        var hint = await (await PostAsync(user, "/api/ai/composition/hint", new { cardIds = ids })).ReadAsync<CompositionHintResponseDto>();

        Assert.Equal("The dog sat.", example.Example);
        Assert.Equal("A kutya leült.", hint.Text);
        Assert.All(Server.Requests, request => Assert.Equal("A1", request.UserJson.P("level").GetString()));
    }

    [Fact]
    public async Task CompositionExample_MixedDeckLevels_FallBackToTheAccountLevel()
    {
        var user = await UserAsync(s => s.ExampleLevel = "C1");
        var deckA = await user.CreateDeckAsync();
        var deckB = await user.CreateDeckAsync();
        await user.PutJsonAsync($"/api/decks/{deckA.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = "A1" });
        await user.PutJsonAsync($"/api/decks/{deckB.Id}/example-level", new UpdateDeckExampleLevelDto { ExampleLevel = "B2" });
        var a = await user.CreateCardAsync(deckA.Id, "a", "d");
        var b = await user.CreateCardAsync(deckB.Id, "b", "d");
        Server.Reply(new { example = "A and b." });

        await PostAsync(user, "/api/ai/composition/example", new { cardIds = new[] { a.Id, b.Id } });

        Assert.Equal("C1", Server.Requests.Single().UserJson.P("level").GetString());
    }

    [Fact]
    public async Task CompositionExampleAndHint_EmptyOrTooLong_AreInvalid()
    {
        var (user, cards) = await UserWithCardsAsync(2);
        var ids = cards.Select(c => c.Id).ToList();
        Server.Reply(new { example = "" });
        Server.Reply(new { text = new string('x', 501) });

        await (await PostAsync(user, "/api/ai/composition/example", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.BadGateway);
        await (await PostAsync(user, "/api/ai/composition/hint", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.BadGateway);
    }

    [Fact]
    public async Task CompositionExampleAndHint_ForeignCards_Return404()
    {
        var (_, cards) = await UserWithCardsAsync(2);
        var intruder = await UserAsync();
        var ids = cards.Select(c => c.Id).ToList();

        await (await PostAsync(intruder, "/api/ai/composition/example", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await PostAsync(intruder, "/api/ai/composition/hint", new { cardIds = ids })).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(Server.Requests);
    }

    // ================= pakli kitöltése (import) =================

    private static object FillBody(int deckId, params object[] items) => new { deckId, items };

    private static object FillItem(string term, bool definition = false, bool example = false, bool simplify = false, string? meanings = null, string? existingDefinition = null) =>
        new { term, targetMeanings = meanings, needDefinition = definition, needExample = example, simplifyMeaning = simplify, definition = existingDefinition };

    private static object FillReply(params object[] items) => new { items };

    [Fact]
    public async Task DeckFill_FillsDefinitionsAndExamples_AndCountsThemAgainstTheDailyLimit()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var (a, b) = (Word(), Word());
        Server.Reply(FillReply(
            new { index = 0, definition = "A pet that barks.", example = $"I walk my {a}.", meaning = "" },
            new { index = 1, definition = "A pet that purrs.", example = $"The {b} sleeps.", meaning = "" }));

        var response = await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(a, definition: true, example: true), FillItem(b, definition: true, example: true)));

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var result = await response.ReadAsync<GenerateDeckFillResponseDto>();
        Assert.Equal(["A pet that barks.", "A pet that purrs."], result.Items.Select(i => i.Definition));
        Assert.Equal([$"I walk my {a}.", $"The {b} sleeps."], result.Items.Select(i => i.Example));
        Assert.All(result.Items, item => Assert.Null(item.Error));
        Assert.Equal((2, 100, 98), (result.UsedToday, result.DailyLimit, result.RemainingToday));
        Assert.Single(Server.Requests);
        var key = a.ToLowerInvariant();
        Assert.Equal(1, await factory.WithDbAsync(db => db.SavedDefinitions.CountAsync(item => item.TermKey == key)));
        Assert.Equal(1, await factory.WithDbAsync(db => db.SavedExamples.CountAsync(item => item.TermKey == key)));
        Assert.Equal(98, (await user.GetSettingsAsync()).AiFillRemainingToday);
    }

    [Fact]
    public async Task DeckFill_RejectedItemsAreRetriedWithThePreviousProblem()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var term = Word();
        Server.Reply(FillReply(new { index = 0, definition = $"It is a {term}.", example = "", meaning = "" }));
        Server.Reply(FillReply(new { index = 0, definition = "A pet that barks.", example = "", meaning = "" }));

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(term, definition: true)))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Equal("A pet that barks.", result.Items[0].Definition);
        Assert.Null(result.Items[0].Error);
        Assert.Equal(2, Server.Requests.Count);
        Assert.Contains("contained the term", Server.Requests[1].UserJson.P("items")[0].P("previousProblem").GetString());
    }

    [Fact]
    public async Task DeckFill_OnlyUnfinishedItemsAreAskedAgain()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var (good, bad) = (Word(), Word());
        Server.Reply(FillReply(
            new { index = 0, definition = "A pet that barks.", example = "", meaning = "" },
            new { index = 1, definition = "", example = "", meaning = "" }));
        Server.Reply(FillReply(new { index = 1, definition = "A pet that purrs.", example = "", meaning = "" }));

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(good, definition: true), FillItem(bad, definition: true)))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Equal(["A pet that barks.", "A pet that purrs."], result.Items.Select(i => i.Definition));
        var second = Server.Requests[1].UserJson.P("items");
        Assert.Equal(1, second.GetArrayLength());
        Assert.Equal(1, second[0].P("index").GetInt32());
    }

    [Fact]
    public async Task DeckFill_AfterThreeFailedAttempts_TheItemCarriesAnError_ButOthersSucceed()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var (good, bad) = (Word(), Word());
        for (var i = 0; i < 3; i++)
        {
            Server.Reply(FillReply(
                new { index = 0, definition = i == 0 ? "A pet that barks." : "", example = "", meaning = "" },
                new { index = 1, definition = "", example = "", meaning = "" }));
        }

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(good, definition: true), FillItem(bad, definition: true)))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Null(result.Items[0].Error);
        Assert.Equal("Az AI nem adott érvényes definíciót.", result.Items[1].Error);
        Assert.Equal(1, result.UsedToday);
        Assert.Equal(3, Server.Requests.Count); // a hibás elemet legfeljebb háromszor kéri
    }

    [Fact]
    public async Task DeckFill_ExampleNeedsADefinitionAndTheTerm()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var term = Word();
        Server.Reply(FillReply(new { index = 0, definition = "", example = "No such word here.", meaning = "" }));
        Server.Reply(FillReply(new { index = 0, definition = "", example = $"A sentence with {term} inside.", meaning = "" }));

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(term, example: true, existingDefinition: "given definition")))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Equal($"A sentence with {term} inside.", result.Items[0].Example);
        Assert.Null(result.Items[0].Definition);
        Assert.Equal("given definition", Server.Requests[0].UserJson.P("items")[0].P("definition").GetString());
    }

    [Fact]
    public async Task DeckFill_SimplifiedMeaning_DropsPartsWithTheEnglishTerm()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var term = Word();
        Server.Reply(FillReply(new { index = 0, definition = "", example = "", meaning = $"kutya, {term} eb, eb" }));

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(term, simplify: true, meanings: "kutya; eb; ebféle; blabla")))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Equal("kutya, eb", result.Items[0].TargetMeanings);
        Assert.Null(result.Items[0].Error);
        Assert.Equal(1, result.UsedToday);
    }

    [Fact]
    public async Task DeckFill_MeaningThatNeverImproves_KeepsTheOriginalAndReportsIt()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var term = Word();
        for (var i = 0; i < 3; i++)
        {
            Server.Reply(FillReply(new { index = 0, definition = "", example = "", meaning = "" }));
        }

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(term, simplify: true)))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Null(result.Items[0].TargetMeanings);
        Assert.Equal("A magyar jelentést nem sikerült egyszerűsíteni, az eredeti maradt.", result.Items[0].Error);
    }

    [Fact]
    public async Task DeckFill_MeaningLongerThan150Characters_IsNotAccepted()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        var term = Word();
        for (var i = 0; i < 3; i++)
        {
            Server.Reply(FillReply(new { index = 0, definition = "", example = "", meaning = new string('á', 151) }));
        }

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(term, simplify: true)))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Null(result.Items[0].TargetMeanings);
        Assert.NotNull(result.Items[0].Error);
    }

    [Fact]
    public async Task DeckFill_AProviderErrorOnTheFirstAttemptIsRetried()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        Server.ReplyStatus(HttpStatusCode.InternalServerError);
        Server.Reply(FillReply(new { index = 0, definition = "A pet that barks.", example = "", meaning = "" }));

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(Word(), definition: true)))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Equal("A pet that barks.", result.Items[0].Definition);
        Assert.Equal(2, Server.Requests.Count);
    }

    [Fact]
    public async Task DeckFill_ThreeProviderErrorsInARow_MapTo502()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        for (var i = 0; i < 3; i++)
        {
            Server.ReplyStatus(HttpStatusCode.InternalServerError);
        }

        var response = await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(Word(), definition: true)));

        await response.AssertStatusAsync(HttpStatusCode.BadGateway);
        Assert.Equal(3, Server.Requests.Count);
    }

    [Fact]
    public async Task DeckFill_MissingConfiguration_IsNotRetried()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        using var _ = factory.OverrideConfig("AiSettings:ApiKey", "");

        var response = await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(Word(), definition: true)));

        await response.AssertStatusAsync(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task DeckFill_NothingToFill_NeedsNoAiCall()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(Word())))).ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Single(result.Items);
        Assert.Equal(0, result.UsedToday);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task DeckFill_ForeignDeck_Returns404()
    {
        var owner = await UserAsync();
        var intruder = await UserAsync();
        var deck = await owner.DefaultDeckAsync();

        await (await PostAsync(intruder, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem("x", definition: true)))).AssertStatusAsync(HttpStatusCode.NotFound);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task DeckFill_BatchSizeLimits()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();

        await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id))).AssertStatusAsync(HttpStatusCode.BadRequest);
        var eleven = Enumerable.Range(0, 11).Select(i => FillItem($"w{i}")).ToArray();
        await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, eleven))).AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Empty(Server.Requests);
    }

    [Fact]
    public async Task DeckFill_DailyLimitIsEnforcedOnlyWhenSwitchedOn()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        using var limit = factory.OverrideConfig("AiFill:DailyLimit", "2");

        // kikapcsolt érvényesítésnél a keret csak számolódik, a hátralévő érték negatív is lehet
        Server.Reply(FillReply(
            new { index = 0, definition = "One.", example = "", meaning = "" },
            new { index = 1, definition = "Two.", example = "", meaning = "" },
            new { index = 2, definition = "Three.", example = "", meaning = "" }));
        var over = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(Word(), definition: true), FillItem(Word(), definition: true), FillItem(Word(), definition: true))))
            .ReadAsync<GenerateDeckFillResponseDto>();
        Assert.Equal((3, 2, -1), (over.UsedToday, over.DailyLimit, over.RemainingToday));

        using var enforce = factory.OverrideConfig("AiFill:EnforceDailyLimit", "true");
        var response = await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(Word(), definition: true)));

        await response.AssertStatusAsync(HttpStatusCode.TooManyRequests);
        Assert.Equal("Elérted a mai AI-kitöltési keretet.", await response.ProblemTitleAsync());
        Assert.Single(Server.Requests); // a második kérés már nem ment ki
    }

    [Fact]
    public async Task DeckFill_WhenTheLimitIsEnforced_ARequestThatFitsIsStillServed()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();
        using var limit = factory.OverrideConfig("AiFill:DailyLimit", "2");
        using var enforce = factory.OverrideConfig("AiFill:EnforceDailyLimit", "true");
        Server.Reply(FillReply(
            new { index = 0, definition = "One.", example = "", meaning = "" },
            new { index = 1, definition = "Two.", example = "", meaning = "" }));

        var result = await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(Word(), definition: true), FillItem(Word(), definition: true))))
            .ReadAsync<GenerateDeckFillResponseDto>();

        Assert.Equal(0, result.RemainingToday);
        var next = await user.NextAsync();
        Assert.False(next.AiCheckAvailable); // a keret elfogyott: az MI-ellenőrzés nem érhető el
    }

    [Fact]
    public async Task DeckFill_TermFieldLimits()
    {
        var user = await UserAsync();
        var deck = await user.DefaultDeckAsync();

        await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem(new string('t', 101), definition: true)))).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem("x", definition: true, meanings: new string('m', 301))))).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await PostAsync(user, "/api/ai/generate/deck-fill", FillBody(deck.Id, FillItem("x", example: true, existingDefinition: new string('d', 501))))).AssertStatusAsync(HttpStatusCode.BadRequest);
    }
}
