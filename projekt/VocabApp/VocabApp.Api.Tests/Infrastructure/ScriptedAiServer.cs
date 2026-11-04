using System.Net;
using System.Text;
using System.Text.Json;

namespace VocabApp.Api.Tests.Infrastructure;

public static class JsonElementExtensions
{
    /// <summary>Tulajdonság név szerint, kis- és nagybetűtől függetlenül (a promptok kulcsai vegyesen PascalCase/camelCase-ek).</summary>
    public static JsonElement P(this JsonElement element, string name)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                return property.Value;
            }
        }

        throw new KeyNotFoundException($"Nincs '{name}' tulajdonság: {element.GetRawText()}");
    }
}

public sealed record RecordedAiRequest(string Url, string Body, string? Authorization, string? Referer, string? Title)
{
    private JsonDocument? document;

    public JsonElement Json => (document ??= JsonDocument.Parse(Body)).RootElement;

    public string Model => Json.GetProperty("model").GetString()!;

    public string SystemPrompt => Json.GetProperty("messages")[0].GetProperty("content").GetString()!;

    /// <summary>A felhasználói üzenet (maga is JSON-szöveg).</summary>
    public string UserPrompt => Json.GetProperty("messages")[1].GetProperty("content").GetString()!;

    public JsonElement UserJson => JsonDocument.Parse(UserPrompt).RootElement;
}

/// <summary>
/// Hamis OpenRouter: előre megírt válaszokat ad vissza sorrendben, és rögzíti a kéréseket.
/// Ha nincs több előkészített válasz, a kérés hibával (HTTP 599) végződik, hogy a teszt észrevegye a váratlan hívást.
/// </summary>
public sealed class ScriptedAiServer : HttpMessageHandler
{
    private readonly object gate = new();
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> script = new();
    private readonly List<RecordedAiRequest> requests = [];

    public IReadOnlyList<RecordedAiRequest> Requests
    {
        get
        {
            lock (gate)
            {
                return requests.ToList();
            }
        }
    }

    public int Remaining
    {
        get
        {
            lock (gate)
            {
                return script.Count;
            }
        }
    }

    public void Reset()
    {
        lock (gate)
        {
            script.Clear();
            requests.Clear();
        }
    }

    /// <summary>Az MI "üzenetének" tartalma egy JSON-objektum (a szolgáltató ilyet ad vissza).</summary>
    public void Reply(object content) => ReplyText(JsonSerializer.Serialize(content));

    /// <summary>Az MI üzenetének nyers szövege (pl. hibás JSON vagy kódblokkba csomagolt JSON).</summary>
    public void ReplyText(string content) => Enqueue(_ => Ok(JsonSerializer.Serialize(new
    {
        choices = new[] { new { message = new { content } } }
    })));

    /// <summary>Teljes, nyers választörzs (hibás burkoló vizsgálatához).</summary>
    public void ReplyEnvelope(string rawBody) => Enqueue(_ => Ok(rawBody));

    public void ReplyStatus(HttpStatusCode status, string body = "{\"error\":\"upstream\"}") =>
        Enqueue(_ => new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") });

    public void ReplyThrow(Exception exception) => Enqueue(_ => throw exception);

    private void Enqueue(Func<HttpRequestMessage, HttpResponseMessage> response)
    {
        lock (gate)
        {
            script.Enqueue(response);
        }
    }

    private static HttpResponseMessage Ok(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
        Func<HttpRequestMessage, HttpResponseMessage>? next;
        lock (gate)
        {
            requests.Add(new RecordedAiRequest(
                request.RequestUri?.ToString() ?? string.Empty,
                body,
                request.Headers.Authorization?.ToString(),
                request.Headers.TryGetValues("HTTP-Referer", out var referer) ? referer.FirstOrDefault() : null,
                request.Headers.TryGetValues("X-Title", out var title) ? title.FirstOrDefault() : null));
            script.TryDequeue(out next);
        }

        return next is null
            ? new HttpResponseMessage((HttpStatusCode)599) { Content = new StringContent("unexpected AI call") }
            : next(request);
    }
}
