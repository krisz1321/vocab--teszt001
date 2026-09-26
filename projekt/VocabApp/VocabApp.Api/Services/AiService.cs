using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public sealed class AiService(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<AiService> logger,
    AppDbContext dbContext) : IAiService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<GenerateDefinitionResponseDto> GenerateDefinitionAsync(
        GenerateDefinitionRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var promptHash = HashPrompt($"definition\n{request.Term.Trim().ToLowerInvariant()}");
        var cached = await FindCachedAsync<GenerateDefinitionResponseDto>(promptHash, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        const string systemPrompt =
            "Write one concise, one-sentence English definition. Do not use the given term, its root, " +
            "or an obvious inflected form. Return only a JSON object with exactly one string property: definition.";
        var userPrompt = $"Define this English term: {JsonSerializer.Serialize(request.Term)}";

        var content = await SendChatRequestAsync(systemPrompt, userPrompt, cancellationToken);
        var result = DeserializeContent<GenerateDefinitionResponseDto>(content);

        if (string.IsNullOrWhiteSpace(result.Definition) ||
            result.Definition.Length > 500 ||
            ContainsForbiddenTermOrStem(result.Definition, request.Term))
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI definition did not satisfy the response contract.");
        }

        var stored = await SaveCacheAsync(promptHash, JsonSerializer.Serialize(result, SerializerOptions), cancellationToken);
        return stored is null ? result : DeserializeCached<GenerateDefinitionResponseDto>(stored);
    }

    public async Task<GenerateExampleResponseDto> GenerateExampleAsync(
        GenerateExampleRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var promptHash = HashPrompt(
            $"example\n{request.Term.Trim().ToLowerInvariant()}\n{request.Definition.Trim()}");
        var cached = await FindCachedAsync<GenerateExampleResponseDto>(promptHash, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        const string systemPrompt =
            "Write one natural English example sentence that contains the supplied term unchanged. " +
            "Return only a JSON object with exactly one string property: example.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            request.Definition
        });

        var content = await SendChatRequestAsync(systemPrompt, userPrompt, cancellationToken);
        var result = DeserializeContent<GenerateExampleResponseDto>(content);

        if (string.IsNullOrWhiteSpace(result.Example) ||
            result.Example.Length > 500 ||
            !ContainsTokenSequence(result.Example, request.Term))
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI example did not satisfy the response contract.");
        }

        var stored = await SaveCacheAsync(promptHash, JsonSerializer.Serialize(result, SerializerOptions), cancellationToken);
        return stored is null ? result : DeserializeCached<GenerateExampleResponseDto>(stored);
    }

    public async Task<ValidateAnswerResponseDto> ValidateAnswerAsync(
        ValidateAnswerRequestDto request,
        CancellationToken cancellationToken = default)
    {
        const string systemPrompt =
            "Compare the learner's answer with the reference definition semantically. Accept minor grammar and " +
            "spelling errors, but reject a substantially wrong or opposite meaning. Return only a JSON object " +
            "with exactly two properties: isCorrect (boolean) and feedback (a non-empty Hungarian string of at " +
            "most two sentences).";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            referenceDefinition = request.Definition,
            learnerAnswer = request.Answer
        });

        var content = await SendChatRequestAsync(systemPrompt, userPrompt, cancellationToken);
        var result = DeserializeContent<ValidateAnswerResponseDto>(content);

        if (string.IsNullOrWhiteSpace(result.Feedback) || result.Feedback.Length > 500)
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI validation did not satisfy the response contract.");
        }

        return result;
    }

    private async Task<T?> FindCachedAsync<T>(string promptHash, CancellationToken cancellationToken)
    {
        var responseText = await dbContext.AiCaches
            .AsNoTracking()
            .Where(item => item.PromptHash == promptHash)
            .Select(item => item.ResponseText)
            .FirstOrDefaultAsync(cancellationToken);

        return responseText is null ? default : DeserializeCached<T>(responseText);
    }

    private async Task<string?> SaveCacheAsync(
        string promptHash,
        string responseText,
        CancellationToken cancellationToken)
    {
        dbContext.AiCaches.Add(new AiCache
        {
            PromptHash = promptHash,
            ResponseText = responseText
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return null;
        }
        catch (DbUpdateException)
        {
            foreach (var entry in dbContext.ChangeTracker.Entries<AiCache>().ToList())
            {
                if (entry.State == EntityState.Added)
                {
                    entry.State = EntityState.Detached;
                }
            }

            var existing = await dbContext.AiCaches
                .AsNoTracking()
                .Where(item => item.PromptHash == promptHash)
                .Select(item => item.ResponseText)
                .FirstOrDefaultAsync(cancellationToken);

            if (existing is not null)
            {
                return existing;
            }

            throw;
        }
    }

    private static T DeserializeCached<T>(string responseText) =>
        JsonSerializer.Deserialize<T>(responseText, SerializerOptions)
        ?? throw new JsonException("The cached response JSON was null.");

    private static string HashPrompt(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private async Task<string> SendChatRequestAsync(
        string systemPrompt,
        string userPrompt,
        CancellationToken cancellationToken)
    {
        var endpoint = configuration["AiSettings:Endpoint"];
        var apiKey = configuration["AiSettings:ApiKey"];
        var model = configuration["AiSettings:Model"];

        if (string.IsNullOrWhiteSpace(endpoint) ||
            string.IsNullOrWhiteSpace(apiKey) ||
            string.IsNullOrWhiteSpace(model))
        {
            throw new AiServiceException(
                AiServiceErrorKind.Configuration,
                "The AI service is not configured.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        var httpReferer = configuration["AiSettings:HttpReferer"];
        if (!string.IsNullOrWhiteSpace(httpReferer))
        {
            request.Headers.TryAddWithoutValidation("HTTP-Referer", httpReferer);
        }

        var appName = configuration["AiSettings:AppName"];
        if (!string.IsNullOrWhiteSpace(appName))
        {
            request.Headers.TryAddWithoutValidation("X-Title", appName);
        }

        request.Content = JsonContent.Create(new
        {
            model,
            temperature = 0.2,
            max_tokens = 4096,
            reasoning = new { effort = "low" },
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            }
        });

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken);
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new AiServiceException(
                AiServiceErrorKind.Upstream,
                "The AI service request timed out.",
                exception);
        }
        catch (HttpRequestException exception)
        {
            throw new AiServiceException(
                AiServiceErrorKind.Upstream,
                "The AI service could not be reached.",
                exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                logger.LogWarning(
                    "AI provider returned HTTP status {StatusCode}. Body: {Body}",
                    (int)response.StatusCode,
                    Truncate(errorBody));
                throw new AiServiceException(
                    AiServiceErrorKind.Upstream,
                    "The AI provider returned an unsuccessful response.");
            }

            try
            {
                await using var responseStream =
                    await response.Content.ReadAsStreamAsync(cancellationToken);
                using var document = await JsonDocument.ParseAsync(
                    responseStream,
                    cancellationToken: cancellationToken);
                var content = ExtractMessageContent(document.RootElement);

                if (string.IsNullOrWhiteSpace(content))
                {
                    logger.LogWarning(
                        "AI provider returned empty content. Envelope: {Envelope}",
                        Truncate(document.RootElement.GetRawText()));
                    throw new JsonException("The response content is empty.");
                }

                return content;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception) when (
                exception is JsonException or KeyNotFoundException or InvalidOperationException
                    or IndexOutOfRangeException)
            {
                throw new AiServiceException(
                    AiServiceErrorKind.InvalidResponse,
                    "The AI provider returned an invalid response envelope.",
                    exception);
            }
        }
    }

    private static T DeserializeContent<T>(string content)
    {
        try
        {
            content = ExtractJsonObject(content);

            using var document = JsonDocument.Parse(content);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                throw new JsonException("The response content must be a JSON object.");
            }

            var expectedProperties = typeof(T)
                .GetProperties()
                .Select(property => JsonNamingPolicy.CamelCase.ConvertName(property.Name))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            if (!expectedProperties.All(property =>
                    document.RootElement.TryGetProperty(property, out _) ||
                    document.RootElement.EnumerateObject()
                        .Any(actual => actual.Name.Equals(property, StringComparison.OrdinalIgnoreCase))))
            {
                throw new JsonException("The response JSON is missing required properties.");
            }

            return JsonSerializer.Deserialize<T>(content, SerializerOptions)
                ?? throw new JsonException("The response JSON was null.");
        }
        catch (JsonException exception)
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI provider returned invalid JSON content.",
                exception);
        }
    }

    private static string ExtractMessageContent(JsonElement root)
    {
        var message = root.GetProperty("choices")[0].GetProperty("message");
        if (message.TryGetProperty("content", out var contentElement))
        {
            var content = ReadTextContent(contentElement);
            if (!string.IsNullOrWhiteSpace(content))
            {
                return content;
            }
        }

        return string.Empty;
    }

    private static string? ReadTextContent(JsonElement contentElement)
    {
        return contentElement.ValueKind switch
        {
            JsonValueKind.String => contentElement.GetString(),
            JsonValueKind.Array => string.Join(
                string.Empty,
                contentElement.EnumerateArray()
                    .Select(part =>
                    {
                        if (part.ValueKind == JsonValueKind.String)
                        {
                            return part.GetString();
                        }

                        if (part.ValueKind == JsonValueKind.Object &&
                            part.TryGetProperty("text", out var text) &&
                            text.ValueKind == JsonValueKind.String)
                        {
                            return text.GetString();
                        }

                        return null;
                    })),
            _ => null
        };
    }

    private static string ExtractJsonObject(string content)
    {
        content = content
            .Replace("```json", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("```", string.Empty, StringComparison.Ordinal)
            .Trim();

        var start = content.IndexOf('{');
        var end = content.LastIndexOf('}');
        if (start >= 0 && end > start)
        {
            return content[start..(end + 1)];
        }

        return content;
    }

    private static string Truncate(string? value, int maxLength = 1000)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value ?? string.Empty;
        }

        return value[..maxLength];
    }

    private static bool ContainsForbiddenTermOrStem(string definition, string term)
    {
        var definitionTokens = Tokenize(definition);
        foreach (var termToken in Tokenize(term))
        {
            if (definitionTokens.Contains(termToken, StringComparer.Ordinal))
            {
                return true;
            }

            if (termToken.Length >= 6)
            {
                var stem = termToken[..^2];
                if (definitionTokens.Any(token => token.StartsWith(stem, StringComparison.Ordinal)))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static bool ContainsTokenSequence(string value, string expected)
    {
        var valueTokens = Tokenize(value);
        var expectedTokens = Tokenize(expected);
        if (expectedTokens.Count == 0 || expectedTokens.Count > valueTokens.Count)
        {
            return false;
        }

        for (var index = 0; index <= valueTokens.Count - expectedTokens.Count; index++)
        {
            if (expectedTokens
                .Select((token, offset) => token == valueTokens[index + offset])
                .All(matches => matches))
            {
                return true;
            }
        }

        return false;
    }

    private static IReadOnlyList<string> Tokenize(string value)
    {
        var tokens = new List<string>();
        var current = new List<char>();

        foreach (var character in value)
        {
            if (char.IsLetterOrDigit(character))
            {
                current.Add(char.ToLowerInvariant(character));
            }
            else if (current.Count > 0)
            {
                tokens.Add(new string(current.ToArray()));
                current.Clear();
            }
        }

        if (current.Count > 0)
        {
            tokens.Add(new string(current.ToArray()));
        }

        return tokens;
    }
}
