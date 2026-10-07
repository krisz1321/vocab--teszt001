using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IFreeStudyService
{
    Task<DeckCardResult<IReadOnlyList<FreeStudyCardDto>>> GetCardsAsync(
        int userId,
        int? deckId,
        string? focus,
        string? tag,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<bool>> MarkAsync(
        int userId,
        int cardId,
        bool knows,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<bool>> ClearMarkAsync(
        int userId,
        int cardId,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<bool>> ClearMarksAsync(
        int userId,
        int? deckId,
        CancellationToken cancellationToken = default);
}
