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

    public async Task<GenerateDefinitionResponseDto?> GenerateDefinitionAsync(
        int userId,
        GenerateDefinitionRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.Id == request.CardId && card.Deck.UserId == userId)
            .Select(card => new
            {
                card.Definition,
                DeckLevel = card.Deck.ExampleLevel,
                AccountLevel = card.Deck.User.ExampleLevel,
                card.Deck.User.ReuseSavedExamples,
                card.Deck.User.GenerateAlternateDefinitions
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (owned is null)
        {
            return null;
        }

        if (!owned.GenerateAlternateDefinitions)
        {
            return new GenerateDefinitionResponseDto
            {
                Definition = owned.Definition,
                FromCard = true
            };
        }

        string level;
        if (ExampleLevels.IsAllowed(owned.DeckLevel))
        {
            level = owned.DeckLevel;
        }
        else if (ExampleLevels.IsAllowed(owned.AccountLevel))
        {
            level = owned.AccountLevel;
        }
        else
        {
            level = ExampleLevels.Default;
        }

        var termKey = request.Term.Trim().ToLowerInvariant();
        if (owned.ReuseSavedExamples)
        {
            var savedDefinitions = await dbContext.SavedDefinitions
                .AsNoTracking()
                .Where(item => item.TermKey == termKey && item.Level == level)
                .Select(item => item.Definition)
                .ToListAsync(cancellationToken);

            if (savedDefinitions.Count > 0 && Random.Shared.Next(2) == 0)
            {
                return new GenerateDefinitionResponseDto
                {
                    Definition = savedDefinitions[Random.Shared.Next(savedDefinitions.Count)],
                    Reused = true
                };
            }
        }

        var systemPrompt =
            "Write one short English sentence that defines the supplied term. " +
            $"The requested CEFR level is {level}; treat it as a recommendation and prefer that level's vocabulary. " +
            "Do not use the given term, its root, or an obvious inflected form. " +
            "Return only a JSON object with exactly one string property: definition.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            Level = level
        });

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
        var generated = DeserializeContent<GeneratedDefinitionContent>(content);
        var definition = generated.Definition.Trim();

        if (string.IsNullOrWhiteSpace(definition) ||
            definition.Length > 500 ||
            ContainsForbiddenTermOrStem(definition, request.Term))
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI definition did not satisfy the response contract.");
        }

        await SaveDefinitionAsync(termKey, level, definition, cancellationToken);
        return new GenerateDefinitionResponseDto
        {
            Definition = definition
        };
    }

    public async Task<GenerateCardDefinitionResponseDto?> GenerateCardDefinitionAsync(
        int userId,
        GenerateCardDefinitionRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Decks
            .AsNoTracking()
            .Where(deck => deck.Id == request.DeckId && deck.UserId == userId)
            .Select(deck => new
            {
                DeckLevel = deck.ExampleLevel,
                AccountLevel = deck.User.ExampleLevel,
                deck.User.ReuseSavedExamples
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (owned is null)
        {
            return null;
        }

        string level;
        if (ExampleLevels.IsAllowed(owned.DeckLevel))
        {
            level = owned.DeckLevel;
        }
        else if (ExampleLevels.IsAllowed(owned.AccountLevel))
        {
            level = owned.AccountLevel;
        }
        else
        {
            level = ExampleLevels.Default;
        }

        var termKey = request.Term.Trim().ToLowerInvariant();
        if (owned.ReuseSavedExamples)
        {
            var savedDefinitions = await dbContext.SavedDefinitions
                .AsNoTracking()
                .Where(item => item.TermKey == termKey && item.Level == level)
                .Select(item => item.Definition)
                .ToListAsync(cancellationToken);

            if (savedDefinitions.Count > 0 && Random.Shared.Next(2) == 0)
            {
                return new GenerateCardDefinitionResponseDto
                {
                    Definition = savedDefinitions[Random.Shared.Next(savedDefinitions.Count)]
                };
            }
        }

        var systemPrompt =
            "Write one short English sentence that defines the supplied term. " +
            $"The requested CEFR level is {level}; treat it as a recommendation and prefer that level's vocabulary. " +
            "Do not use the given term, its root, or an obvious inflected form. " +
            "Return only a JSON object with exactly one string property: definition.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            Level = level
        });

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
        var generated = DeserializeContent<GeneratedDefinitionContent>(content);
        var definition = generated.Definition.Trim();

        if (string.IsNullOrWhiteSpace(definition) ||
            definition.Length > 500 ||
            ContainsForbiddenTermOrStem(definition, request.Term))
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI definition did not satisfy the response contract.");
        }

        await SaveDefinitionAsync(termKey, level, definition, cancellationToken);
        return new GenerateCardDefinitionResponseDto
        {
            Definition = definition
        };
    }

    public async Task<GenerateExtraDefinitionResponseDto?> GenerateExtraDefinitionAsync(
        int userId,
        GenerateExtraDefinitionRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.Id == request.CardId && card.Deck.UserId == userId)
            .Select(card => new
            {
                DeckLevel = card.Deck.ExampleLevel,
                AccountLevel = card.Deck.User.ExampleLevel,
                card.Deck.User.ReuseSavedExamples,
                card.Deck.User.GenerateAlternateDefinitions
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (owned is null)
        {
            return null;
        }

        if (!owned.GenerateAlternateDefinitions)
        {
            return new GenerateExtraDefinitionResponseDto
            {
                Available = false,
                Reason = GenerateExtraDefinitionResponseDto.AlternateDisabled
            };
        }

        string level;
        if (ExampleLevels.IsAllowed(owned.DeckLevel))
        {
            level = owned.DeckLevel;
        }
        else if (ExampleLevels.IsAllowed(owned.AccountLevel))
        {
            level = owned.AccountLevel;
        }
        else
        {
            level = ExampleLevels.Default;
        }

        var termKey = request.Term.Trim().ToLowerInvariant();
        var avoidDefinition = request.AvoidDefinition.Trim();
        if (owned.ReuseSavedExamples)
        {
            var savedDefinitions = await dbContext.SavedDefinitions
                .AsNoTracking()
                .Where(item => item.TermKey == termKey && item.Level == level)
                .Select(item => item.Definition)
                .ToListAsync(cancellationToken);
            var differentEnough = savedDefinitions
                .Where(definition => IsAcceptableExtraDefinition(definition, request.Term, avoidDefinition))
                .ToList();

            if (differentEnough.Count > 0 && Random.Shared.Next(2) == 0)
            {
                return new GenerateExtraDefinitionResponseDto
                {
                    Available = true,
                    Definition = differentEnough[Random.Shared.Next(differentEnough.Count)]
                };
            }
        }

        var systemPrompt =
            "Write one short English sentence that defines the supplied term in a different wording from the definition to avoid. " +
            $"The requested CEFR level is {level}; treat it as a recommendation and prefer that level's vocabulary. " +
            "Do not use the given term, its root, or an obvious inflected form. " +
            "Return only a JSON object with exactly one string property: definition.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            AvoidDefinition = avoidDefinition,
            Level = level
        });

        string? accepted = null;
        for (var attempt = 0; attempt < 2 && accepted is null; attempt++)
        {
            var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
            var generated = DeserializeContent<GeneratedDefinitionContent>(content);
            var definition = generated.Definition.Trim();
            if (IsAcceptableExtraDefinition(definition, request.Term, avoidDefinition))
            {
                accepted = definition;
            }
        }

        if (accepted is null)
        {
            return new GenerateExtraDefinitionResponseDto
            {
                Available = false,
                Reason = GenerateExtraDefinitionResponseDto.NotDifferentEnough
            };
        }

        await SaveDefinitionAsync(termKey, level, accepted, cancellationToken);
        return new GenerateExtraDefinitionResponseDto
        {
            Available = true,
            Definition = accepted
        };
    }

    public async Task<GenerateExampleResponseDto?> GenerateExampleAsync(
        int userId,
        GenerateExampleRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.Id == request.CardId && card.Deck.UserId == userId)
            .Select(card => new
            {
                DeckLevel = card.Deck.ExampleLevel,
                AccountLevel = card.Deck.User.ExampleLevel,
                card.Deck.User.ReuseSavedExamples
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (owned is null)
        {
            return null;
        }

        string level;
        if (ExampleLevels.IsAllowed(owned.DeckLevel))
        {
            level = owned.DeckLevel;
        }
        else if (ExampleLevels.IsAllowed(owned.AccountLevel))
        {
            level = owned.AccountLevel;
        }
        else
        {
            level = ExampleLevels.Default;
        }

        var termKey = request.Term.Trim().ToLowerInvariant();
        var definitionKey = request.Definition.Trim();

        if (owned.ReuseSavedExamples)
        {
            var savedSentences = await dbContext.SavedExamples
                .AsNoTracking()
                .Where(item => item.TermKey == termKey && item.DefinitionKey == definitionKey && item.Level == level)
                .Select(item => item.Sentence)
                .ToListAsync(cancellationToken);

            if (savedSentences.Count > 0 && Random.Shared.Next(2) == 0)
            {
                return new GenerateExampleResponseDto
                {
                    Example = savedSentences[Random.Shared.Next(savedSentences.Count)],
                    Reused = true
                };
            }
        }

        var systemPrompt =
            "Write one natural English example sentence that contains the supplied term unchanged. " +
            $"The requested CEFR level is {level}; treat it as a recommendation and prefer that level's vocabulary and grammar. " +
            "If the term itself is harder or easier than that level, keep the rest of the sentence close to the requested level. " +
            "Return only a JSON object with exactly one string property: example.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            request.Definition,
            Level = level
        });

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
        var generated = DeserializeContent<GeneratedExampleContent>(content);
        var sentence = generated.Example.Trim();

        if (string.IsNullOrWhiteSpace(sentence) ||
            sentence.Length > 500 ||
            !ContainsTokenSequence(sentence, request.Term))
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI example did not satisfy the response contract.");
        }

        await SaveExampleAsync(termKey, definitionKey, level, sentence, cancellationToken);
        return new GenerateExampleResponseDto
        {
            Example = sentence,
            Reused = false
        };
    }

    public async Task<GenerateTargetMeaningResponseDto> GenerateTargetMeaningAsync(
        int userId,
        GenerateTargetMeaningRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var model = await ResolveModelAsync(userId, cancellationToken);
        var promptHash = HashPrompt(
            $"target-meaning\n{model}\n{request.Term.Trim().ToLowerInvariant()}\n{request.Definition.Trim()}");
        var cached = await FindCachedAsync<GenerateTargetMeaningResponseDto>(promptHash, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        const string systemPrompt =
            "The learner's target language is Hungarian. Give two to five short Hungarian equivalents " +
            "of the English term, separated by commas. Do not include any English text. " +
            "Return only a JSON object with exactly one string property: meanings.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            request.Definition
        });

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken, model);
        var result = DeserializeContent<GenerateTargetMeaningResponseDto>(content);
        result.Meanings = result.Meanings.Trim();

        if (string.IsNullOrWhiteSpace(result.Meanings) ||
            result.Meanings.Length > 200 ||
            ContainsTokenSequence(result.Meanings, request.Term))
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI target meaning did not satisfy the response contract.");
        }

        var stored = await SaveCacheAsync(promptHash, JsonSerializer.Serialize(result, SerializerOptions), cancellationToken);
        return stored is null ? result : DeserializeCached<GenerateTargetMeaningResponseDto>(stored);
    }

    public async Task<ValidateAnswerResponseDto> ValidateAnswerAsync(
        int userId,
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

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
        var result = DeserializeContent<ValidateAnswerResponseDto>(content);

        if (string.IsNullOrWhiteSpace(result.Feedback) || result.Feedback.Length > 500)
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI validation did not satisfy the response contract.");
        }

        return result;
    }

    private sealed class GeneratedDefinitionContent
    {
        public string Definition { get; set; } = string.Empty;
    }

    private sealed class GeneratedExampleContent
    {
        public string Example { get; set; } = string.Empty;
    }

    private async Task SaveDefinitionAsync(
        string termKey,
        string level,
        string definition,
        CancellationToken cancellationToken)
    {
        var exists = await dbContext.SavedDefinitions
            .AsNoTracking()
            .AnyAsync(
                item => item.TermKey == termKey &&
                        item.Level == level &&
                        item.Definition == definition,
                cancellationToken);

        if (exists)
        {
            return;
        }

        dbContext.SavedDefinitions.Add(new SavedDefinition
        {
            TermKey = termKey,
            Level = level,
            Definition = definition
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            foreach (var entry in dbContext.ChangeTracker.Entries<SavedDefinition>().ToList())
            {
                if (entry.State == EntityState.Added)
                {
                    entry.State = EntityState.Detached;
                }
            }

            var stored = await dbContext.SavedDefinitions
                .AsNoTracking()
                .AnyAsync(
                    item => item.TermKey == termKey &&
                            item.Level == level &&
                            item.Definition == definition,
                    cancellationToken);

            if (!stored)
            {
                throw;
            }
        }
    }

    private async Task SaveExampleAsync(
        string termKey,
        string definitionKey,
        string level,
        string sentence,
        CancellationToken cancellationToken)
    {
        var exists = await dbContext.SavedExamples
            .AsNoTracking()
            .AnyAsync(
                item => item.TermKey == termKey &&
                        item.DefinitionKey == definitionKey &&
                        item.Level == level &&
                        item.Sentence == sentence,
                cancellationToken);

        if (exists)
        {
            return;
        }

        dbContext.SavedExamples.Add(new SavedExample
        {
            TermKey = termKey,
            DefinitionKey = definitionKey,
            Level = level,
            Sentence = sentence
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            foreach (var entry in dbContext.ChangeTracker.Entries<SavedExample>().ToList())
            {
                if (entry.State == EntityState.Added)
                {
                    entry.State = EntityState.Detached;
                }
            }

            var stored = await dbContext.SavedExamples
                .AsNoTracking()
                .AnyAsync(
                    item => item.TermKey == termKey &&
                            item.DefinitionKey == definitionKey &&
                            item.Level == level &&
                            item.Sentence == sentence,
                    cancellationToken);

            if (!stored)
            {
                throw;
            }
        }
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

    private async Task<string> ResolveModelAsync(int userId, CancellationToken cancellationToken)
    {
        var stored = await dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => user.AiModel)
            .SingleOrDefaultAsync(cancellationToken);

        return AiModels.IsAllowed(stored) ? stored : AiModels.Default;
    }

    private async Task<string> SendChatRequestAsync(
        int userId,
        string systemPrompt,
        string userPrompt,
        CancellationToken cancellationToken,
        string? resolvedModel = null)
    {
        var endpoint = configuration["AiSettings:Endpoint"];
        var apiKey = configuration["AiSettings:ApiKey"];
        var model = resolvedModel ?? await ResolveModelAsync(userId, cancellationToken);

        if (string.IsNullOrWhiteSpace(endpoint) || string.IsNullOrWhiteSpace(apiKey))
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

    private static bool IsAcceptableExtraDefinition(string definition, string term, string avoidDefinition)
    {
        return !string.IsNullOrWhiteSpace(definition) &&
               definition.Length <= 500 &&
               !ContainsForbiddenTermOrStem(definition, term) &&
               DiffersEnough(definition, avoidDefinition);
    }

    private static bool DiffersEnough(string candidate, string avoid)
    {
        var candidateWords = Tokenize(candidate).ToHashSet(StringComparer.Ordinal);
        var avoidWords = Tokenize(avoid).ToHashSet(StringComparer.Ordinal);
        if (candidateWords.Count == 0 || avoidWords.Count == 0)
        {
            return false;
        }

        var common = candidateWords.Count(word => avoidWords.Contains(word));
        var union = candidateWords.Count + avoidWords.Count - common;
        return union > 0 && 7L * union >= 10L * common;
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
