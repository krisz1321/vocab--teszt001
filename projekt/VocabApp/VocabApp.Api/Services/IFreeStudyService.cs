using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IFreeStudyService
{
    Task<DeckCardResult<IReadOnlyList<FreeStudyCardDto>>> GetCardsAsync(
        int userId,
        int? deckId,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<bool>> MarkAsync(
        int userId,
        int cardId,
        bool knows,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<bool>> ClearMarksAsync(
        int userId,
        int? deckId,
        CancellationToken cancellationToken = default);
}
