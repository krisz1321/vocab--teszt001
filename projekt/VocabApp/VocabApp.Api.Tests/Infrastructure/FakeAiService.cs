using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Tests.Infrastructure;

/// <summary>
/// Az integrációs tesztek MI-szolgáltatása: soha nem hív külső szolgáltatót (nem kerül pénzbe).
/// Alapból hihető választ ad; a <see cref="FailWith"/> minden hívást az adott hibával dob el.
/// </summary>
public sealed class FakeAiService : IAiService
{
    private readonly List<string> calls = [];

    public IReadOnlyList<string> Calls
    {
        get
        {
            lock (calls)
            {
                return calls.ToList();
            }
        }
    }

    public AiServiceErrorKind? FailWith { get; set; }

    /// <summary>Ha igaz, az ellenőrző hívások (grammar/composition check) hibás választ adnak.</summary>
    public bool RejectChecks { get; set; }

    public void Reset()
    {
        FailWith = null;
        RejectChecks = false;
        lock (calls)
        {
            calls.Clear();
        }
    }

    private void Record(string name)
    {
        lock (calls)
        {
            calls.Add(name);
        }

        if (FailWith is { } kind)
        {
            throw new AiServiceException(kind, "Teszt MI-hiba.");
        }
    }

    public Task<GenerateDefinitionResponseDto?> GenerateDefinitionAsync(int userId, GenerateDefinitionRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateDefinitionAsync));
        return Task.FromResult<GenerateDefinitionResponseDto?>(new() { Definition = "A generated definition.", FromCard = false });
    }

    public Task<GenerateCardDefinitionResponseDto?> GenerateCardDefinitionAsync(int userId, GenerateCardDefinitionRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateCardDefinitionAsync));
        return Task.FromResult<GenerateCardDefinitionResponseDto?>(new() { Definition = "A generated card definition." });
    }

    public Task<GenerateExtraDefinitionResponseDto?> GenerateExtraDefinitionAsync(int userId, GenerateExtraDefinitionRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateExtraDefinitionAsync));
        return Task.FromResult<GenerateExtraDefinitionResponseDto?>(new() { Available = true, Definition = "Another definition." });
    }

    public Task<GenerateExampleResponseDto?> GenerateExampleAsync(int userId, GenerateExampleRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateExampleAsync));
        return Task.FromResult<GenerateExampleResponseDto?>(new() { Example = "A generated example." });
    }

    public Task<GenerateDeckFillResponseDto?> GenerateDeckFillAsync(int userId, GenerateDeckFillRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateDeckFillAsync));
        return Task.FromResult<GenerateDeckFillResponseDto?>(new()
        {
            Items = request.Items.Select((_, index) => new DeckFillResultDto { Index = index, Definition = "Filled definition." }).ToList(),
            UsedToday = request.Items.Count,
            DailyLimit = 100,
            RemainingToday = 100 - request.Items.Count
        });
    }

    public Task<GenerateTargetMeaningResponseDto> GenerateTargetMeaningAsync(int userId, GenerateTargetMeaningRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateTargetMeaningAsync));
        return Task.FromResult(new GenerateTargetMeaningResponseDto { Meanings = "teszt jelentés" });
    }

    public Task<ValidateAnswerResponseDto> ValidateAnswerAsync(int userId, ValidateAnswerRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(ValidateAnswerAsync));
        return Task.FromResult(new ValidateAnswerResponseDto { IsCorrect = true });
    }

    public Task<AppealAnswerResponseDto?> AppealAnswerAsync(int userId, AppealAnswerRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(AppealAnswerAsync));
        return Task.FromResult<AppealAnswerResponseDto?>(new() { Accepted = true, Feedback = "Elfogadva." });
    }

    public Task<ExplainAnswerResponseDto> ExplainAnswerAsync(int userId, ExplainAnswerRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(ExplainAnswerAsync));
        return Task.FromResult(new ExplainAnswerResponseDto { OnTopic = true, Text = "Magyarázat." });
    }

    public Task<RecognizeAmbiguityResponseDto?> RecognizeAmbiguityAsync(int userId, RecognizeAmbiguityRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(RecognizeAmbiguityAsync));
        return Task.FromResult<RecognizeAmbiguityResponseDto?>(new() { MatchesTerm = false, FitsGuess = true, Hint = "Tipp." });
    }

    public Task<GrammarCheckResponseDto?> CheckGrammarSentenceAsync(int userId, GrammarCheckRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(CheckGrammarSentenceAsync));
        var ok = !RejectChecks;
        return Task.FromResult<GrammarCheckResponseDto?>(new()
        {
            IsCorrect = ok,
            TermUsedCorrectly = ok,
            TenseCorrect = ok,
            GrammarCorrect = ok,
            Feedback = ok ? string.Empty : "Hibás mondat.",
            CorrectedSentence = request.Sentence
        });
    }

    public Task<GrammarExampleResponseDto?> GenerateGrammarExampleAsync(int userId, GrammarExampleRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateGrammarExampleAsync));
        return Task.FromResult<GrammarExampleResponseDto?>(new() { Example = "An example sentence." });
    }

    public Task<GrammarHintResponseDto?> GenerateGrammarHintAsync(int userId, GrammarHintRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateGrammarHintAsync));
        return Task.FromResult<GrammarHintResponseDto?>(new() { Sentence = "Magyar tipp mondat." });
    }

    public Task<CompositionCheckResponseDto?> CheckCompositionAsync(int userId, CompositionCheckRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(CheckCompositionAsync));
        var ok = !RejectChecks;
        return Task.FromResult<CompositionCheckResponseDto?>(new()
        {
            IsCorrect = ok,
            Words = request.CardIds.Select(id => new CompositionWordResultDto { CardId = id, Term = $"word{id}", UsedCorrectly = ok }).ToList(),
            GrammarCorrect = ok,
            Coherent = ok,
            Feedback = ok ? string.Empty : "Hibás szöveg.",
            CorrectedText = request.Text
        });
    }

    public Task<CompositionExampleResponseDto?> GenerateCompositionExampleAsync(int userId, CompositionCardsRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateCompositionExampleAsync));
        return Task.FromResult<CompositionExampleResponseDto?>(new() { Example = "A composed example." });
    }

    public Task<CompositionHintResponseDto?> GenerateCompositionHintAsync(int userId, CompositionCardsRequestDto request, CancellationToken cancellationToken = default)
    {
        Record(nameof(GenerateCompositionHintAsync));
        return Task.FromResult<CompositionHintResponseDto?>(new() { Text = "Magyar tipp szöveg." });
    }
}
