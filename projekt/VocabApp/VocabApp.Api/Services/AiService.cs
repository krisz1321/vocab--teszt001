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
    AppDbContext dbContext,
    AiFillUsage aiFillUsage) : IAiService
{
    private const string OffTopicText = "Ez nem kapcsolódik a tárgyhoz.";

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
                card.Deck.User.SavedLevelPolicy,
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
            var savedDefinitions = await MatchingDefinitionsAsync(
                termKey,
                owned.SavedLevelPolicy,
                level,
                cancellationToken);

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
                deck.User.ReuseSavedExamples,
                deck.User.SavedLevelPolicy
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
            var savedDefinitions = await MatchingDefinitionsAsync(
                termKey,
                owned.SavedLevelPolicy,
                level,
                cancellationToken);

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
                card.Deck.User.SavedLevelPolicy,
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
            var savedDefinitions = await MatchingDefinitionsAsync(
                termKey,
                owned.SavedLevelPolicy,
                level,
                cancellationToken);
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
                card.Deck.User.ReuseSavedExamples,
                card.Deck.User.SavedLevelPolicy
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
            var savedRows = await dbContext.SavedExamples
                .AsNoTracking()
                .Where(item => item.TermKey == termKey && item.DefinitionKey == definitionKey)
                .Select(item => new { item.Level, item.Sentence })
                .ToListAsync(cancellationToken);
            var savedSentences = savedRows
                .Where(item => SavedLevelPolicies.Matches(owned.SavedLevelPolicy, level, item.Level))
                .Select(item => item.Sentence)
                .ToList();

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

    public async Task<GenerateDeckFillResponseDto?> GenerateDeckFillAsync(
        int userId,
        GenerateDeckFillRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Decks
            .AsNoTracking()
            .Where(deck => deck.Id == request.DeckId && deck.UserId == userId)
            .Select(deck => new
            {
                DeckLevel = deck.ExampleLevel,
                AccountLevel = deck.User.ExampleLevel
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (owned is null)
        {
            return null;
        }

        var level = ExampleLevels.IsAllowed(owned.DeckLevel)
            ? owned.DeckLevel
            : ExampleLevels.IsAllowed(owned.AccountLevel)
                ? owned.AccountLevel
                : ExampleLevels.Default;

        // A napi keret alapból csak számolva van; az EnforceDailyLimit bekapcsolásáig nem tilt.
        if (aiFillUsage.EnforceDailyLimit)
        {
            var before = await aiFillUsage.GetStatusAsync(userId, cancellationToken);
            if (before.Remaining < request.Items.Count)
            {
                throw new AiServiceException(
                    AiServiceErrorKind.LimitReached,
                    "The daily AI fill limit was reached.");
            }
        }

        var items = request.Items;
        var results = items.Select((_, index) => new DeckFillResultDto { Index = index }).ToList();
        var needDefinition = items.Select(item => item.NeedDefinition).ToArray();
        var needExample = items.Select(item => item.NeedExample).ToArray();
        var definitions = items.Select(item => item.Definition?.Trim() ?? string.Empty).ToArray();

        for (var attempt = 0; attempt < 2; attempt++)
        {
            var pending = Enumerable.Range(0, items.Count)
                .Where(index => needDefinition[index] || needExample[index])
                .ToList();
            if (pending.Count == 0)
            {
                break;
            }

            const string systemPromptStart =
                "You help build flashcards for an English learner whose first language is Hungarian. " +
                "The user message is a JSON object with a CEFR level and an items array. " +
                "For every item write only the fields it asks for. " +
                "definition: one short English sentence that defines the term. Do not use the term, its root, or an " +
                "obvious inflected form; for a multi-word term do not repeat the whole phrase. " +
                "example: one natural English sentence that contains the term unchanged. ";
            var systemPrompt =
                systemPromptStart +
                $"The requested CEFR level is {level}; treat it as a recommendation and prefer that level's vocabulary and grammar. " +
                "If the term itself is harder or easier than that level, keep the rest of the sentence close to the requested level. " +
                "The Hungarian meaning, when given, only tells which sense of the term is meant; never put Hungarian in the output. " +
                "When a definition is supplied for an item, the example must fit that sense. " +
                "Return only a JSON object with exactly one property: items, an array with one object per requested item. " +
                "Each object has an integer property index (copied from the input) and string properties definition and example; " +
                "use an empty string for a field that was not requested.";
            var userPrompt = JsonSerializer.Serialize(new
            {
                Level = level,
                Items = pending.Select(index => new
                {
                    Index = index,
                    items[index].Term,
                    HungarianMeaning = items[index].TargetMeanings,
                    NeedDefinition = needDefinition[index],
                    NeedExample = needExample[index],
                    Definition = definitions[index].Length == 0 ? null : definitions[index]
                })
            });

            GeneratedDeckFillContent generated;
            try
            {
                var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
                generated = DeserializeContent<GeneratedDeckFillContent>(content);
            }
            catch (AiServiceException exception) when (exception.Kind != AiServiceErrorKind.Configuration)
            {
                // Az első sikertelen kísérlet után még egyszer próbáljuk; ha már van elkészült elem, a többit hibásnak jelöljük.
                if (attempt == 0)
                {
                    continue;
                }

                if (results.Any(result => result.Definition is not null || result.Example is not null))
                {
                    break;
                }

                throw;
            }

            foreach (var generatedItem in generated.Items)
            {
                var index = generatedItem.Index;
                if (!pending.Contains(index))
                {
                    continue;
                }

                var term = items[index].Term;
                if (needDefinition[index])
                {
                    var definition = generatedItem.Definition?.Trim() ?? string.Empty;
                    if (definition.Length > 0 && definition.Length <= 500 && DefinitionAvoidsTerm(definition, term))
                    {
                        results[index].Definition = definition;
                        definitions[index] = definition;
                        needDefinition[index] = false;
                    }
                }

                // A példát csak akkor fogadjuk el, ha van mihez kötni: a szükséges definíció már megvan.
                if (needExample[index] && !needDefinition[index])
                {
                    var example = generatedItem.Example?.Trim() ?? string.Empty;
                    if (example.Length > 0 && example.Length <= 500 && ExampleContainsTerm(example, term))
                    {
                        results[index].Example = example;
                        needExample[index] = false;
                    }
                }
            }
        }

        var generatedCount = 0;
        for (var index = 0; index < items.Count; index++)
        {
            var result = results[index];
            if (result.Definition is not null || result.Example is not null)
            {
                generatedCount++;
            }

            if (needDefinition[index] || needExample[index])
            {
                result.Error = needDefinition[index]
                    ? "Az AI nem adott érvényes definíciót."
                    : "Az AI nem adott érvényes példamondatot.";
            }

            var termKey = items[index].Term.Trim().ToLowerInvariant();
            if (result.Definition is not null)
            {
                await SaveDefinitionAsync(termKey, level, result.Definition, cancellationToken);
            }

            if (result.Example is not null && definitions[index].Length > 0)
            {
                await SaveExampleAsync(termKey, definitions[index], level, result.Example, cancellationToken);
            }
        }

        var status = await aiFillUsage.AddAsync(userId, generatedCount, cancellationToken);
        return new GenerateDeckFillResponseDto
        {
            Items = results,
            UsedToday = status.Used,
            DailyLimit = status.DailyLimit,
            RemainingToday = status.Remaining
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
        var acceptHungarian = false;
        if (request.Paraphrase)
        {
            acceptHungarian = await dbContext.Users
                .AsNoTracking()
                .Where(user => user.Id == userId)
                .Select(user => (bool?)user.AcceptHungarianParaphrase)
                .SingleOrDefaultAsync(cancellationToken) ?? false;
        }

        var systemPrompt = request.Paraphrase
            ? acceptHungarian
                ? "The learner is paraphrasing the reference definition and may answer in English or Hungarian. " +
                  "Compare the learner's answer with the reference definition semantically. Accept the answer when " +
                  "its meaning matches, in either language. Accept minor grammar and spelling errors, but reject a " +
                  "substantially wrong or opposite meaning. Return only a JSON object with exactly three properties: " +
                  "isCorrect (boolean), feedback (a non-empty Hungarian string of at most two sentences), and " +
                  "englishAnswer (a string of at most 500 characters). When isCorrect is true, englishAnswer is the " +
                  "learner's own sentence rewritten as one English sentence, not a new definition. For the term " +
                  "\"cat\", the Hungarian answer \"egy háziállat ami dorombol\" can be correct, and englishAnswer " +
                  "can be \"A pet that purrs.\" When isCorrect is false, englishAnswer is an empty string."
                : "The learner is paraphrasing the reference definition and must answer in English. Compare the " +
                  "learner's answer with the reference definition semantically. Accept minor grammar and spelling " +
                  "errors, but reject a substantially wrong or opposite meaning. An answer in Hungarian is incorrect " +
                  "even when its meaning matches; in that case isCorrect is false and the feedback asks the learner " +
                  "to write the paraphrase in English. Return only a JSON object with exactly three properties: " +
                  "isCorrect (boolean), feedback (a non-empty Hungarian string of at most two sentences), and " +
                  "englishAnswer (an empty string)."
            : "Compare the learner's answer with the reference definition semantically. Accept minor grammar and " +
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
        ValidateAnswerResponseDto result;
        if (request.Paraphrase)
        {
            var parsed = DeserializeContent<ParaphraseValidationContent>(content);
            result = new ValidateAnswerResponseDto
            {
                IsCorrect = parsed.IsCorrect,
                Feedback = parsed.Feedback?.Trim() ?? string.Empty,
                EnglishAnswer = parsed.EnglishAnswer?.Trim() ?? string.Empty
            };
        }
        else
        {
            var parsed = DeserializeContent<MeaningValidationContent>(content);
            result = new ValidateAnswerResponseDto
            {
                IsCorrect = parsed.IsCorrect,
                Feedback = parsed.Feedback?.Trim() ?? string.Empty
            };
        }

        if (string.IsNullOrWhiteSpace(result.Feedback) || result.Feedback.Length > 500)
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI validation did not satisfy the response contract.");
        }

        if (!request.Paraphrase || !acceptHungarian || !result.IsCorrect)
        {
            result.EnglishAnswer = string.Empty;
        }
        else if (string.IsNullOrWhiteSpace(result.EnglishAnswer) || result.EnglishAnswer.Length > 500)
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI validation did not satisfy the response contract.");
        }

        return result;
    }

    public async Task<AppealAnswerResponseDto?> AppealAnswerAsync(
        int userId,
        AppealAnswerRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var requireAppealReason = await dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => (bool?)user.RequireAppealReason)
            .SingleOrDefaultAsync(cancellationToken);

        var reason = request.Reason?.Trim() ?? string.Empty;
        var requiresReason = requireAppealReason is null || requireAppealReason.Value;
        if (requiresReason && reason.Length == 0)
        {
            return null;
        }

        const string systemPrompt =
            "The learner's answer was marked incorrect. They defend it with a justification written in Hungarian or English. " +
            "Decide whether the justification makes the original answer acceptable against the reference definition. " +
            "Minor grammar and spelling errors are not a reason to reject. " +
            "A substantially different or opposite meaning stays incorrect, even with a justification. " +
            "A weak or unrelated justification does not make the answer correct. " +
            "For the term \"cat\", the Hungarian answer \"egy háziállat ami dorombol\" can be accepted when the justification " +
            "shows that this meaning matches the reference. " +
            "Return only a JSON object with exactly two properties: accepted (boolean) and feedback (a non-empty Hungarian " +
            "string of at most two sentences).";
        var userPrompt = JsonSerializer.Serialize(new
        {
            request.Term,
            referenceDefinition = request.Definition,
            learnerAnswer = request.Answer,
            justification = reason
        });

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
        var parsed = DeserializeContent<AppealContent>(content);
        var feedback = parsed.Feedback?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(feedback) || feedback.Length > 500)
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI appeal did not satisfy the response contract.");
        }

        return new AppealAnswerResponseDto
        {
            Accepted = parsed.Accepted,
            Feedback = feedback
        };
    }

    public async Task<ExplainAnswerResponseDto> ExplainAnswerAsync(
        int userId,
        ExplainAnswerRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var recentMessages = (request.Messages ?? [])
            .Select(message => new
            {
                role = message.Role.Trim().ToLowerInvariant(),
                content = message.Content.Trim()
            })
            .Where(message => message.content.Length > 0 && message.role is "user" or "assistant")
            .TakeLast(8)
            .ToList();

        const string systemPrompt =
            "You help a learner understand a vocabulary answer. The learner may write in Hungarian or English. " +
            "Use the word, the reference definition, and the learner's answer. " +
            "When there are no messages, explain how the learner's answer compares with the reference definition, in Hungarian, and set onTopic to true. " +
            "When messages are present, answer the latest learner question. " +
            "A question may be about the word, its meaning, its grammar, its synonyms, or why the answer was wrong. " +
            "A broad question that still belongs to language learning is allowed. " +
            "Refuse topics that are independent of this word and of language learning. Space travel and other unrelated subjects are not allowed. " +
            "Return only a JSON object with exactly two properties: onTopic (boolean) and text (a non-empty Hungarian string of at most 1500 characters). " +
            "When the latest question is unrelated, onTopic is false and text is exactly: Ez nem kapcsolódik a tárgyhoz. " +
            "When onTopic is true, text answers in Hungarian.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            term = request.Term.Trim(),
            referenceDefinition = request.Definition.Trim(),
            learnerAnswer = request.Answer.Trim(),
            messages = recentMessages
        });

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
        var parsed = DeserializeContent<ExplainContent>(content);
        if (!parsed.OnTopic)
        {
            return new ExplainAnswerResponseDto
            {
                OnTopic = false,
                Text = OffTopicText
            };
        }

        var text = parsed.Text?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text) || text.Length > 1500)
        {
            throw new AiServiceException(
                AiServiceErrorKind.InvalidResponse,
                "The AI explanation did not satisfy the response contract.");
        }

        return new ExplainAnswerResponseDto
        {
            OnTopic = true,
            Text = text
        };
    }

    public async Task<RecognizeAmbiguityResponseDto?> RecognizeAmbiguityAsync(
        int userId,
        RecognizeAmbiguityRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var owned = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.Id == request.CardId && card.Deck.UserId == userId)
            .Select(card => new
            {
                card.Term,
                DeckLevel = card.Deck.ExampleLevel,
                AccountLevel = card.Deck.User.ExampleLevel
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (owned is null)
        {
            return null;
        }

        var term = owned.Term.Trim();
        var guess = request.Guess.Trim();
        var visibleDefinition = request.Definition.Trim();
        if (NormalizeAnswer(guess) == NormalizeAnswer(term))
        {
            return new RecognizeAmbiguityResponseDto
            {
                MatchesTerm = true
            };
        }

        var fits = await DefinitionFitsGuessAsync(userId, visibleDefinition, guess, cancellationToken);
        if (!fits)
        {
            return new RecognizeAmbiguityResponseDto();
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

        var hint = await CreateNarrowingHintAsync(
            userId,
            term,
            guess,
            visibleDefinition,
            level,
            cancellationToken);

        if (hint is not null)
        {
            await SaveDefinitionAsync(term.ToLowerInvariant(), level, hint, cancellationToken);
        }

        return new RecognizeAmbiguityResponseDto
        {
            FitsGuess = true,
            Hint = hint
        };
    }

    private async Task<bool> DefinitionFitsGuessAsync(
        int userId,
        string visibleDefinition,
        string guess,
        CancellationToken cancellationToken)
    {
        const string systemPrompt =
            "Decide whether the supplied English definition is also true of the learner's guess. " +
            "Judge the guess by its meaning. The guess may be English or another language, including Hungarian. " +
            "The definition fits when it correctly describes the guess, even if it could also describe other words. " +
            "The definition does not fit when it is false for that guess. " +
            "Return only a JSON object with exactly one boolean property: fitsGuess.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            Definition = visibleDefinition,
            Guess = guess
        });

        var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
        return DeserializeContent<FitsGuessContent>(content).FitsGuess;
    }

    private async Task<string?> CreateNarrowingHintAsync(
        int userId,
        string term,
        string guess,
        string visibleDefinition,
        string level,
        CancellationToken cancellationToken)
    {
        var systemPrompt =
            "Write one short English sentence that is true of the supplied term and false of the rejected guess. " +
            "Judge the rejected guess by its meaning, even when it is not English, for example Hungarian. " +
            $"The requested CEFR level is {level}; treat it as a recommendation and prefer that level's vocabulary. " +
            "Do not use the term, its root, or an obvious inflected form. " +
            "Do not use the rejected guess, its root, or an obvious inflected form. " +
            "Do not repeat the visible definition. " +
            "Return only a JSON object with exactly one string property: definition.";
        var userPrompt = JsonSerializer.Serialize(new
        {
            Term = term,
            RejectedGuess = guess,
            VisibleDefinition = visibleDefinition,
            Level = level
        });

        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                var content = await SendChatRequestAsync(userId, systemPrompt, userPrompt, cancellationToken);
                var generated = DeserializeContent<GeneratedDefinitionContent>(content);
                var definition = generated.Definition.Trim();
                if (IsAcceptableNarrowingHint(definition, term, guess, visibleDefinition))
                {
                    return definition;
                }
            }
            catch (AiServiceException) when (attempt == 0)
            {
                continue;
            }
            catch (AiServiceException)
            {
                return null;
            }
        }

        return null;
    }

    private sealed class MeaningValidationContent
    {
        public bool IsCorrect { get; set; }

        public string? Feedback { get; set; }
    }

    private sealed class ParaphraseValidationContent
    {
        public bool IsCorrect { get; set; }

        public string? Feedback { get; set; }

        public string? EnglishAnswer { get; set; }
    }

    private sealed class AppealContent
    {
        public bool Accepted { get; set; }

        public string? Feedback { get; set; }
    }

    private sealed class ExplainContent
    {
        public bool OnTopic { get; set; }

        public string? Text { get; set; }
    }

    private sealed class GeneratedDefinitionContent
    {
        public string Definition { get; set; } = string.Empty;
    }

    private sealed class GeneratedExampleContent
    {
        public string Example { get; set; } = string.Empty;
    }

    private sealed class GeneratedDeckFillContent
    {
        public List<GeneratedDeckFillItem> Items { get; set; } = [];
    }

    private sealed class GeneratedDeckFillItem
    {
        public int Index { get; set; }

        public string? Definition { get; set; }

        public string? Example { get; set; }
    }

    private sealed class FitsGuessContent
    {
        public bool FitsGuess { get; set; }
    }

    private async Task<List<string>> MatchingDefinitionsAsync(
        string termKey,
        string policy,
        string level,
        CancellationToken cancellationToken)
    {
        var savedRows = await dbContext.SavedDefinitions
            .AsNoTracking()
            .Where(item => item.TermKey == termKey)
            .Select(item => new { item.Level, item.Definition })
            .ToListAsync(cancellationToken);

        return savedRows
            .Where(item => SavedLevelPolicies.Matches(policy, level, item.Level))
            .Select(item => item.Definition)
            .ToList();
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

    private async Task IncrementAiCallCountAsync(int userId, CancellationToken cancellationToken)
    {
        await dbContext.Users
            .Where(user => user.Id == userId && user.AiCallCount < int.MaxValue)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(user => user.AiCallCount, user => user.AiCallCount + 1),
                cancellationToken);
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
            await IncrementAiCallCountAsync(userId, cancellationToken);

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

    private static bool IsAcceptableNarrowingHint(
        string definition,
        string term,
        string guess,
        string visibleDefinition)
    {
        return !string.IsNullOrWhiteSpace(definition) &&
               definition.Length <= 500 &&
               !ContainsForbiddenTermOrStem(definition, term) &&
               !ContainsForbiddenTermOrStem(definition, guess) &&
               DiffersEnough(definition, visibleDefinition);
    }

    private static string NormalizeAnswer(string value)
    {
        var parts = value.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts).ToLowerInvariant();
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

    // Egyszavas kifejezésnél a szigorú szabály (se a szó, se a töve), többszavasnál csak a teljes kifejezés tiltott,
    // mert egy "in the first place" definíciója természetes módon használhat "the"-t vagy "in"-t.
    private static bool DefinitionAvoidsTerm(string definition, string term) =>
        Tokenize(term).Count > 1
            ? !ContainsTokenSequence(definition, term)
            : !ContainsForbiddenTermOrStem(definition, term);

    // Az igei "to ..." kifejezésnél a példa elhagyhatja a "to" szót ("jump for joy"), a többi rész egyben marad.
    private static bool ExampleContainsTerm(string example, string term)
    {
        if (ContainsTokenSequence(example, term))
        {
            return true;
        }

        var tokens = Tokenize(term);
        return tokens.Count > 1 && tokens[0] == "to" && ContainsTokenSequence(example, string.Join(' ', tokens.Skip(1)));
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
