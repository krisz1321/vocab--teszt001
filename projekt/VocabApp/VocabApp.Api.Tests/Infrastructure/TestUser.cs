using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.DTOs;

namespace VocabApp.Api.Tests.Infrastructure;

/// <summary>Egy regisztrált tesztfelhasználó bejelentkezett klienssel és a leggyakoribb műveletek rövidítéseivel.</summary>
public sealed class TestUser
{
    public required HttpClient Client { get; init; }

    public required string Email { get; init; }

    public required string Username { get; init; }

    public required string Password { get; init; }

    public required string Token { get; set; }

    public int Id => int.Parse(new JwtSecurityTokenHandler().ReadJwtToken(Token).Subject);

    public static async Task<TestUser> RegisterAsync(ApiFactory factory, string email, string username, string password)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new RegisterDto { Email = email, Username = username, Password = password });
        response.EnsureSuccessStatusCode();
        var auth = await response.ReadAsync<AuthResponseDto>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        return new TestUser { Client = client, Email = email, Username = username, Password = password, Token = auth.Token };
    }

    /// <summary>Az első (regisztrációkor létrehozott) pakli.</summary>
    public async Task<DeckDto> DefaultDeckAsync() => (await GetAsync<List<DeckDto>>("/api/decks")).First();

    public async Task<DeckDto> CreateDeckAsync(string? name = null, string? description = null)
    {
        var response = await Client.PostAsJsonAsync(
            "/api/decks",
            new CreateDeckDto { Name = name ?? $"Pakli {Guid.NewGuid():N}"[..20], Description = description });
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<DeckDto>();
    }

    public async Task<CardDto> CreateCardAsync(
        int deckId,
        string term,
        string definition = "a test definition",
        string? example = null,
        string? targetMeanings = null,
        string? tags = null)
    {
        var response = await Client.PostAsJsonAsync(
            "/api/cards",
            new CreateCardDto
            {
                DeckId = deckId,
                Term = term,
                Definition = definition,
                Example = example,
                TargetMeanings = targetMeanings,
                Tags = tags
            });
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<CardDto>();
    }

    /// <summary>Több kártya létrehozása egy paklihoz (a szavak: <c>prefix1</c>, <c>prefix2</c>…).</summary>
    public async Task<List<CardDto>> CreateCardsAsync(int deckId, int count, string prefix = "word")
    {
        var cards = new List<CardDto>();
        for (var i = 1; i <= count; i++)
        {
            cards.Add(await CreateCardAsync(deckId, $"{prefix}{i}", $"definition of {prefix}{i}", targetMeanings: $"jelentés{i}"));
        }

        return cards;
    }

    public async Task<T> GetAsync<T>(string url)
    {
        var response = await Client.GetAsync(url);
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<T>();
    }

    public Task<HttpResponseMessage> PutJsonAsync<T>(string url, T body) => Client.PutAsJsonAsync(url, body);

    public Task<HttpResponseMessage> PostJsonAsync<T>(string url, T body) => Client.PostAsJsonAsync(url, body);

    public async Task<StudySettingsDto> GetSettingsAsync() => await GetAsync<StudySettingsDto>("/api/study/settings");

    /// <summary>A teljes beállításcsomag mentése (a PUT teljes csere).</summary>
    public async Task<StudySettingsDto> SaveSettingsAsync(Action<StudySettingsDto> change)
    {
        var settings = await GetSettingsAsync();
        change(settings);
        var response = await PutJsonAsync("/api/study/settings", settings);
        response.EnsureSuccessStatusCode();
        return await response.ReadAsync<StudySettingsDto>();
    }

    public async Task<StudyNextDto> NextAsync(string query = "")
    {
        return await GetAsync<StudyNextDto>("/api/study/next" + query);
    }

    public async Task<HttpResponseMessage> SubmitAsync(StudyNextDto next, bool isCorrect)
    {
        return await PostJsonAsync(
            "/api/study/submit",
            new StudySubmitDto { CardId = next.Card!.Id, IsCorrect = isCorrect, AnswerToken = next.AnswerToken! });
    }

    /// <summary>A beállításokat úgy módosítja, hogy a válasz azonnal beküldhető legyen, és a napi korlát ne akadályozzon.</summary>
    public Task<StudySettingsDto> MakeStudyEasyAsync() =>
        SaveSettingsAsync(settings =>
        {
            settings.MinimumAnswerSeconds = 0;
            settings.DailyNewCardGoal = 100;
        });

    public Task<HttpResponseMessage> RawAsync(HttpMethod method, string url, string? body = null, string contentType = "application/json")
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, contentType);
        }

        return Client.SendAsync(request);
    }
}

public static class HttpResponseExtensions
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<T>(text, Options)
            ?? throw new InvalidOperationException($"Üres válasz: {text}");
    }

    public static async Task<string?> ProblemTitleAsync(this HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<ProblemDetails>(text, Options)?.Title;
    }

    public static async Task AssertStatusAsync(this HttpResponseMessage response, HttpStatusCode expected)
    {
        if (response.StatusCode != expected)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new Xunit.Sdk.XunitException($"Várt: {(int)expected} {expected}, kapott: {(int)response.StatusCode} {response.StatusCode}. Törzs: {body}");
        }
    }
}
