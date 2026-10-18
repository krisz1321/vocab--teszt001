using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IGrammarService
{
    Task<DeckCardResult<GrammarTensesDto>> GetTensesAsync(int userId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<GrammarTensesDto>> SetTensesAsync(
        int userId,
        IReadOnlyCollection<string> tenses,
        CancellationToken cancellationToken = default);

    Task RecordAttemptAsync(
        int userId,
        int cardId,
        string tense,
        GrammarCheckResponseDto result,
        CancellationToken cancellationToken = default);
}
