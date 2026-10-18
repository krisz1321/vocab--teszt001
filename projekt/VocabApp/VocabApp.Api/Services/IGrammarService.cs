using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IGrammarService
{
    Task<DeckCardResult<GrammarTensesDto>> GetTensesAsync(int userId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<GrammarTensesDto>> SetTensesAsync(
        int userId,
        IReadOnlyCollection<string> tenses,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<GrammarTranslationDto>> GetTranslationAsync(int userId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<GrammarTranslationDto>> SetTranslationAsync(
        int userId,
        bool enabled,
        CancellationToken cancellationToken = default);

    Task<int> RecordAttemptAsync(
        int userId,
        int cardId,
        string tense,
        GrammarCheckResponseDto result,
        CancellationToken cancellationToken = default);

    Task<bool> AcceptAttemptAsync(int userId, int attemptId, CancellationToken cancellationToken = default);
}
