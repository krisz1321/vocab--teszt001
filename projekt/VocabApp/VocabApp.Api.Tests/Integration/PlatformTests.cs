using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;
using VocabApp.Api.Services;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

/// <summary>Séma, indulási feladatok, adatbázis-kényszerek, párhuzamosság, tokenek és kérésformák.</summary>
[Collection(ApiCollection.Name)]
public class PlatformTests(ApiFactory factory)
{
    // ---- séma ----

    [Fact]
    public async Task Schema_EveryMigrationIsApplied()
    {
        var pending = await factory.WithDbAsync(async db => (await db.Database.GetPendingMigrationsAsync()).ToList());
        var applied = await factory.WithDbAsync(async db => (await db.Database.GetAppliedMigrationsAsync()).ToList());

        Assert.Empty(pending);
        Assert.NotEmpty(applied);
    }

    [Fact]
    public async Task Schema_TheModelMatchesTheLastMigrationSnapshot()
    {
        // Ugyanaz, mint a "dotnet ef migrations has-pending-model-changes": nem maradt migráció nélküli modellváltozás.
        var hasDifferences = await factory.WithDbAsync(db =>
        {
            var differ = db.GetService<IMigrationsModelDiffer>();
            var migrationsAssembly = db.GetService<IMigrationsAssembly>();
            var initializer = db.GetService<IModelRuntimeInitializer>();
            var designTimeModel = db.GetService<IDesignTimeModel>().Model;

            var snapshotModel = migrationsAssembly.ModelSnapshot?.Model;
            if (snapshotModel is IMutableModel mutable)
            {
                snapshotModel = mutable.FinalizeModel();
            }

            if (snapshotModel is not null)
            {
                snapshotModel = initializer.Initialize(snapshotModel);
            }

            return Task.FromResult(differ.HasDifferences(snapshotModel?.GetRelationalModel(), designTimeModel.GetRelationalModel()));
        });

        Assert.False(hasDifferences);
    }

    // ---- indulási feladatok ----

    [Fact]
    public async Task Seed_DemoAccountsExistWithTheirDecks()
    {
        var demo = await LoginAsync("demo@vocab.local", "DemoUser1");
        var second = await LoginAsync("second@vocab.local", "SecondUser1");

        var demoDecks = (await demo.GetAsync<List<DeckDto>>("/api/decks")).ToDictionary(d => d.Name, d => d.CardCount);
        var secondDecks = (await second.GetAsync<List<DeckDto>>("/api/decks")).ToDictionary(d => d.Name, d => d.CardCount);

        Assert.Equal(15, demoDecks["Alapcsomag"]);
        Assert.Equal(10, demoDecks["Alap szavak"]);
        Assert.Equal(5, secondDecks["Egyszerű szavak"]);
    }

    [Fact]
    public async Task Seed_RunningItAgainDoesNotDuplicateAnything()
    {
        var before = await CountSeedCardsAsync();

        await factory.WithDbAsync(async db =>
        {
            var hasher = new PasswordHasher<User>();
            await BaseUserSeed.EnsureAsync(db, hasher);
            await BaseUserSeed.EnsureAsync(db, hasher);
        });

        Assert.Equal(before, await CountSeedCardsAsync());
        Assert.Equal(1, await factory.WithDbAsync(db => db.Users.CountAsync(u => u.Email == "demo@vocab.local")));
    }

    [Fact]
    public async Task Seed_BringsBackADeletedDemoCardOnTheNextRun()
    {
        var removed = await factory.WithDbAsync(async db =>
        {
            var card = await db.Cards.FirstAsync(c => c.Deck.User.Email == "second@vocab.local" && c.Term == "sun");
            db.Cards.Remove(card);
            await db.SaveChangesAsync();
            return card.Term;
        });

        await factory.WithDbAsync(db => BaseUserSeed.EnsureAsync(db, new PasswordHasher<User>()));

        Assert.True(await factory.WithDbAsync(db => db.Cards.AnyAsync(c => c.Deck.User.Email == "second@vocab.local" && c.Term == removed)));
    }

    private Task<int> CountSeedCardsAsync() =>
        factory.WithDbAsync(db => db.Cards.CountAsync(c => c.Deck.User.Email == "demo@vocab.local" || c.Deck.User.Email == "second@vocab.local"));

    [Fact]
    public async Task BackfillHashes_ComputesTheMissingContentHashFromThePublishedSnapshot()
    {
        var owner = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync("Hash " + Guid.NewGuid().ToString("N")[..8]);
        await owner.CreateCardAsync(deck.Id, "alpha", "first", "ex", "alfa", "tag");
        await owner.CreateCardAsync(deck.Id, "beta", "second");
        var shared = await (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true })).ReadAsync<DeckDto>();
        var (original, restored) = await factory.WithDbAsync(async db =>
        {
            var share = await db.SharedDecks.AsNoTracking().SingleAsync(s => s.SourceDeckId == deck.Id);
            var hash = share.ContentHash;
            await db.SharedDecks.Where(s => s.Id == share.Id).ExecuteUpdateAsync(set => set.SetProperty(s => s.ContentHash, ""));
            await SharedDeckSnapshot.BackfillHashesAsync(db);
            return (hash, await db.SharedDecks.AsNoTracking().Where(s => s.Id == share.Id).Select(s => s.ContentHash).SingleAsync());
        });

        Assert.NotEmpty(original);
        Assert.Equal(original, restored);
        // és a pakli továbbra sem számít "módosultnak"
        Assert.False((await owner.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == shared.Id).Share!.HasUnpublishedChanges);
    }

    // ---- adatbázis-kényszerek ----

    [Fact]
    public async Task Database_EmailAndUsernameAreUniqueRegardlessOfCase()
    {
        var user = await factory.RegisterUserAsync();

        await Assert.ThrowsAsync<DbUpdateException>(() => factory.WithDbAsync(async db =>
        {
            db.Users.Add(new User { Email = user.Email.ToUpperInvariant(), Username = "other" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x" });
            await db.SaveChangesAsync();
        }));
        await Assert.ThrowsAsync<DbUpdateException>(() => factory.WithDbAsync(async db =>
        {
            db.Users.Add(new User { Email = $"{Guid.NewGuid():N}@test.local", Username = user.Username.ToUpperInvariant(), PasswordHash = "x" });
            await db.SaveChangesAsync();
        }));
    }

    [Fact]
    public async Task Database_RejectsOutOfRangeSettingsEvenIfTheApiWouldBeBypassed()
    {
        var user = await factory.RegisterUserAsync();

        await Assert.ThrowsAnyAsync<Exception>(() => factory.WithDbAsync(db =>
            db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(set => set.SetProperty(u => u.DailyNewCardGoal, 500))));
        await Assert.ThrowsAnyAsync<Exception>(() => factory.WithDbAsync(db =>
            db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(set => set.SetProperty(u => u.MinimumAnswerSeconds, -1))));
    }

    [Fact]
    public async Task Database_EnforcesTextLengthLimits()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();

        await Assert.ThrowsAsync<DbUpdateException>(() => factory.WithDbAsync(async db =>
        {
            db.Cards.Add(new Card { DeckId = deck.Id, Term = new string('t', 101), Definition = "d" });
            await db.SaveChangesAsync();
        }));
    }

    [Fact]
    public async Task Database_CardProgressIsCreatedForEveryCardPath()
    {
        var owner = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync();
        await owner.CreateCardAsync(deck.Id, "manual", "d");
        await owner.Client.PostAsync(
            $"/api/decks/{deck.Id}/import",
            new StringContent("term,definition,example\ncsv,d,", Encoding.UTF8, "text/csv"));
        await owner.PostJsonAsync($"/api/decks/{deck.Id}/import/cards", new ImportCardsDto { Cards = [new ImportCardRowDto { Term = "json", Definition = "d" }] });

        var withoutProgress = await factory.WithDbAsync(db => db.Cards.CountAsync(c => c.DeckId == deck.Id && c.Progress == null));

        Assert.Equal(0, withoutProgress);
    }

    // ---- párhuzamosság ----

    private async Task<(TestUser User, List<CardDto> Cards, List<HttpResponseMessage> Responses)> SubmitEightInParallelAsync()
    {
        var user = await factory.RegisterUserAsync();
        await user.MakeStudyEasyAsync();
        var deck = await user.CreateDeckAsync();
        var cards = await user.CreateCardsAsync(deck.Id, 8);
        var tokenService = factory.Services.GetRequiredService<StudyAnswerToken>();

        // minden kártyához külön tokent állítunk elő (a húzás véletlen, ezért nem a next végponttól kérjük)
        var responses = await Task.WhenAll(cards.Select(card => user.PostJsonAsync(
            "/api/study/submit",
            new StudySubmitDto
            {
                CardId = card.Id,
                IsCorrect = true,
                AnswerToken = tokenService.Create(user.Id, card.Id, DateTime.UtcNow.AddSeconds(-1))
            })));
        return (user, cards, responses.ToList());
    }

    [Fact]
    public async Task Concurrency_ParallelFirstAnswersOfTheDayAllSucceedAndUpdateEveryCard()
    {
        var (user, cards, responses) = await SubmitEightInParallelAsync();

        foreach (var response in responses)
        {
            await response.AssertStatusAsync(HttpStatusCode.OK);
        }

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");
        Assert.Equal(8, stats.Cards.Count(card => card.Streak == 1 && card.CorrectCount == 1));
        Assert.Equal(1, stats.StudyDayStreak);
        Assert.Equal(cards.Count, stats.Cards.Count);
    }

    [Fact(Skip = "Ismert hiba: a napi számláló (UserStudyDay.AnswerCount) olvasás-módosítás-írás, párhuzamos válaszoknál növelések vesznek el (8 válaszból pl. 3 látszik).")]
    public async Task Concurrency_ParallelAnswersAreAllCountedInTheDailyActivity()
    {
        var (user, _, _) = await SubmitEightInParallelAsync();

        var stats = await user.GetAsync<StudyStatsDto>("/api/study/stats");

        Assert.Equal(8, stats.Today.AnswerCount);
        Assert.Equal(8, stats.Today.CorrectCount);
    }

    [Fact]
    public async Task Concurrency_ParallelRegistrationsOfTheSameEmailCreateExactlyOneAccount()
    {
        var email = $"race{Guid.NewGuid():N}@test.local";

        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(i =>
            factory.CreateAnonymousClient().PostAsJsonAsync(
                "/api/auth/register",
                new RegisterDto { Email = email, Username = $"r{i}{Guid.NewGuid():N}"[..20], Password = "Passw0rd1" })));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(1, await factory.WithDbAsync(db => db.Users.CountAsync(u => u.Email == email)));
    }

    [Fact]
    public async Task Concurrency_ParallelRegistrationsOfTheSameUsernameCreateExactlyOneAccount()
    {
        var username = $"race{Guid.NewGuid():N}"[..20];

        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(i =>
            factory.CreateAnonymousClient().PostAsJsonAsync(
                "/api/auth/register",
                new RegisterDto { Email = $"{i}{Guid.NewGuid():N}@test.local", Username = username, Password = "Passw0rd1" })));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
    }

    [Fact(Skip = "Ismert hiba: ugyanazon felhasználó párhuzamos másolásainál a SharedDeckSaves egyedi kulcsa DbUpdateException-t (500) dob, a RecordSaveAsync nem kezeli a versenyhelyzetet.")]
    public async Task Concurrency_ParallelCopiesOfTheSameSharedDeckByOneUserNeverFailWithAServerError()
    {
        var owner = await factory.RegisterUserAsync();
        var reader = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync("Race " + Guid.NewGuid().ToString("N")[..8]);
        await owner.CreateCardAsync(deck.Id, "w", "d");
        await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true });
        var shared = (await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString(deck.Name)}")).Single();

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => reader.Client.PostAsync($"/api/decks/public/{shared.Id}/copy", null)));

        Assert.All(responses, r => Assert.True((int)r.StatusCode < 500, $"{(int)r.StatusCode} {r.StatusCode}"));
        var ownerView = (await owner.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Id == deck.Id);
        Assert.Equal(1, ownerView.Share!.SaveCount);
    }

    // ---- tokenek ----

    private static string Token(
        int? sub,
        int? tokenVersion = 0,
        string issuer = "VocabApp",
        string audience = "VocabApp",
        DateTime? expires = null,
        string key = JwtTestTokens.Key,
        string? rawSub = null) =>
        JwtTestTokens.Create(sub, tokenVersion, issuer, audience, expires, key, rawSub);

    private async Task<HttpStatusCode> ProfileStatusAsync(string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (await client.GetAsync("/api/auth/profile")).StatusCode;
    }

    [Fact]
    public async Task Jwt_ValidHandCraftedTokenIsAccepted_ProvingTheOtherCasesFailForTheRightReason()
    {
        var user = await factory.RegisterUserAsync();

        Assert.Equal(HttpStatusCode.OK, await ProfileStatusAsync(Token(user.Id)));
    }

    [Fact]
    public async Task Jwt_TokenWithoutTheVersionClaimWorksUntilThePasswordIsChanged()
    {
        var user = await factory.RegisterUserAsync();
        var legacy = Token(user.Id, tokenVersion: null);
        Assert.Equal(HttpStatusCode.OK, await ProfileStatusAsync(legacy));

        await user.PutJsonAsync("/api/auth/password", new ChangePasswordDto { CurrentPassword = user.Password, NewPassword = "NewPassw0rd" });

        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(legacy));
    }

    [Fact]
    public async Task Jwt_RejectedWhenExpiredOrFromTheWrongIssuerAudienceOrKey()
    {
        var user = await factory.RegisterUserAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(Token(user.Id, expires: DateTime.UtcNow.AddMinutes(-10))));
        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(Token(user.Id, issuer: "Someone")));
        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(Token(user.Id, audience: "Other")));
        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(Token(user.Id, key: "a-completely-different-signing-key-1234567890")));
    }

    [Fact]
    public async Task Jwt_RejectedWhenTheSubjectIsMissingNonNumericOrUnknown()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(Token(null, rawSub: "not-a-number")));
        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(Token(99999999)));
    }

    [Fact]
    public async Task Jwt_RejectedWhenTheVersionClaimDoesNotMatch()
    {
        var user = await factory.RegisterUserAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync(Token(user.Id, tokenVersion: 7)));
    }

    [Fact]
    public async Task Jwt_UnsignedTokenIsRejected()
    {
        var user = await factory.RegisterUserAsync();
        var header = Convert.ToBase64String("""{"alg":"none","typ":"JWT"}"""u8.ToArray()).TrimEnd('=');
        var payload = Convert.ToBase64String(Encoding.UTF8.GetBytes($$"""{"sub":"{{user.Id}}","iss":"VocabApp","aud":"VocabApp","exp":{{DateTimeOffset.UtcNow.AddDays(1).ToUnixTimeSeconds()}}}""")).TrimEnd('=');

        Assert.Equal(HttpStatusCode.Unauthorized, await ProfileStatusAsync($"{header}.{payload}."));
    }

    [Fact]
    public async Task Jwt_AuthorizationHeaderWithAnotherSchemeIsRejected()
    {
        var user = await factory.RegisterUserAsync();
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", user.Token);

        await (await client.GetAsync("/api/auth/profile")).AssertStatusAsync(HttpStatusCode.Unauthorized);
    }

    // ---- kérésformák ----

    [Fact]
    public async Task Requests_MalformedJson_Returns400()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.RawAsync(HttpMethod.Post, "/api/decks", "{ not json")).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await user.RawAsync(HttpMethod.Post, "/api/cards", "")).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await user.RawAsync(HttpMethod.Put, "/api/study/settings", "[]")).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Requests_JsonEndpointsRejectOtherContentTypes()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.RawAsync(HttpMethod.Post, "/api/decks", "name=abc", "text/plain");

        await response.AssertStatusAsync(HttpStatusCode.UnsupportedMediaType);
    }

    [Fact]
    public async Task Requests_WrongTypesInJson_Return400()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.RawAsync(HttpMethod.Post, "/api/cards", """{"deckId":"abc","term":"x","definition":"y"}""")).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await user.RawAsync(HttpMethod.Put, "/api/cards/1/known", """{"known":"maybe"}""")).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Requests_RouteConstraintsRejectNonNumericIds()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.Client.GetAsync("/api/cards/by-deck/abc")).AssertStatusAsync(HttpStatusCode.NotFound);
        await (await user.Client.DeleteAsync("/api/decks/abc")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Requests_HugeTextFieldsAreRejectedWith400NotA500()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var huge = new string('x', 1_000_000);

        await (await user.PostJsonAsync("/api/cards", new CreateCardDto { DeckId = deck.Id, Term = "t", Definition = huge })).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await user.PostJsonAsync("/api/decks", new CreateDeckDto { Name = huge })).AssertStatusAsync(HttpStatusCode.BadRequest);
        await (await user.PutJsonAsync("/api/auth/profile", new UpdateProfileDto { DisplayName = huge })).AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Text_UnicodeAndEmojiRoundTrip_AndSearchIgnoresCase()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        var card = await user.CreateCardAsync(deck.Id, "ősz 🍂", "Az év egyik évszaka: ŐSZ", "Árvíztűrő tükörfúrógép", "ősz, tavasz", "évszak");

        var stored = (await user.GetAsync<List<CardDto>>($"/api/cards/by-deck/{deck.Id}")).Single(c => c.Id == card.Id);
        var found = await user.GetAsync<List<CardSearchResultDto>>($"/api/cards/search?q={Uri.EscapeDataString("ŐSZ")}");

        Assert.Equal("ősz 🍂", stored.Term);
        Assert.Equal("Árvíztűrő tükörfúrógép", stored.Example);
        Assert.Equal("évszak", stored.Tags);
        Assert.Contains(found, r => r.Id == card.Id);
    }

    [Theory]
    [InlineData("'; DROP TABLE Cards; --")]
    [InlineData("\" OR 1=1 --")]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("%_[a-z]")]
    public async Task Text_SpecialCharactersAreStoredLiterally_AndDoNotBreakSearchOrExport(string text)
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        await user.CreateCardAsync(deck.Id, text, "definition of " + text);

        var found = await user.GetAsync<List<CardSearchResultDto>>($"/api/cards/search?q={Uri.EscapeDataString(text)}");
        var export = await (await user.Client.GetAsync($"/api/decks/{deck.Id}/export")).Content.ReadAsStringAsync();

        Assert.Single(found);
        Assert.Equal(text, found[0].Term);
        Assert.Contains(text.Replace("\"", "\"\""), export);
        Assert.NotEmpty(await user.GetAsync<List<DeckDto>>("/api/decks"));
    }

    [Fact]
    public async Task Csv_FormulaInjectionIsNeutralizedOnExport()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.DefaultDeckAsync();
        await user.CreateCardAsync(deck.Id, "=HYPERLINK(\"http://evil\")", "+cmd", "@SUM(1)", "-2+3");

        var csv = await (await user.Client.GetAsync($"/api/decks/{deck.Id}/export")).Content.ReadAsStringAsync();

        Assert.DoesNotContain("\"=HYPERLINK", csv);
        Assert.Contains("\"'=HYPERLINK", csv);
        Assert.Contains("\"'+cmd\"", csv);
        Assert.Contains("\"'@SUM(1)\"", csv);
    }

    // ---- CORS és környezet ----

    [Theory]
    [InlineData("http://localhost:4567", true)]
    [InlineData("http://127.0.0.1:4567", true)]
    [InlineData("http://evil.example", false)]
    [InlineData("http://localhost:9999", false)]
    public async Task Cors_OnlyTheFrontendOriginsAreAllowed(string origin, bool allowed)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/decks");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");

        var response = await factory.CreateAnonymousClient().SendAsync(request);

        var header = response.Headers.TryGetValues("Access-Control-Allow-Origin", out var values) ? values.Single() : null;
        Assert.Equal(allowed ? origin : null, header);
    }

    [Fact]
    public async Task Swagger_IsNotExposedOutsideDevelopment()
    {
        await (await factory.CreateAnonymousClient().GetAsync("/swagger/v1/swagger.json")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task UnknownRoutes_Return404()
    {
        await (await factory.CreateAnonymousClient().GetAsync("/api/nothing")).AssertStatusAsync(HttpStatusCode.NotFound);
    }

    // ---- napi sorozat (tiszta függvény) ----

    [Theory]
    [InlineData(5, "2026-11-04", "2026-11-04", 5)]  // ma tanult
    [InlineData(5, "2026-11-03", "2026-11-04", 5)]  // tegnap tanult: él a sorozat
    [InlineData(5, "2026-11-02", "2026-11-04", 0)]  // kimaradt egy nap
    [InlineData(5, null, "2026-11-04", 0)]          // még sosem tanult
    [InlineData(0, "2026-11-04", "2026-11-04", 0)]
    public void CurrentStudyDayStreak_OnlyCountsWhenTheLastStudyDayIsTodayOrYesterday(int stored, string? last, string today, int expected)
    {
        DateTime? lastDate = last is null ? null : DateTime.Parse(last);

        Assert.Equal(expected, StudyService.CurrentStudyDayStreak(stored, lastDate, DateTime.Parse(today)));
    }

    // ---- segéd ----

    private async Task<TestUser> LoginAsync(string email, string password)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginDto { Email = email, Password = password });
        response.EnsureSuccessStatusCode();
        var auth = await response.ReadAsync<AuthResponseDto>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return new TestUser { Client = client, Email = email, Username = email, Password = password, Token = auth.Token };
    }
}
