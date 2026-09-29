using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface ICardService
{
    Task<DeckCardResult<IReadOnlyList<CardDto>>> GetByDeckAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LearnedCardDto>> GetLearnedAsync(
        int userId,
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

    Task<DeckCardResult<CardDto>> SetKnownAsync(
        int userId,
        int cardId,
        bool known,
        CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(int userId, int cardId, CancellationToken cancellationToken = default);

    Task<bool> ResetLearnedAsync(int userId, int cardId, CancellationToken cancellationToken = default);
}
