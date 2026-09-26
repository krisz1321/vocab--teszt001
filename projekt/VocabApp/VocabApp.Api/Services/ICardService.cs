using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface ICardService
{
    Task<DeckCardResult<IReadOnlyList<CardDto>>> GetByDeckAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<CardDto>> CreateAsync(
        int userId,
        CreateCardDto request,
        CancellationToken cancellationToken = default);

    Task<DeckCardResult<CardDto>> UpdateAsync(
        int userId,
        int cardId,
        UpdateCardDto request,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(int userId, int cardId, CancellationToken cancellationToken = default);
}
