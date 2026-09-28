using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IDeckService
{
    Task<IReadOnlyList<DeckDto>> GetAsync(int userId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<DeckDto>> CreateAsync(int userId, CreateDeckDto request, CancellationToken cancellationToken = default);

    Task<DeckCardResult<DeckDto>> RenameAsync(int userId, int deckId, RenameDeckDto request, CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(int userId, int deckId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<DeckDto>> ShareAsync(int userId, int deckId, ShareDeckDto request, CancellationToken cancellationToken = default);

    Task<DeckCardResult<DeckDto>> UpdateExampleLevelAsync(int userId, int deckId, UpdateDeckExampleLevelDto request, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PublicDeckDto>> GetPublicAsync(int userId, string? query, CancellationToken cancellationToken = default);

    Task<DeckCardResult<IReadOnlyList<CardDto>>> GetPublicCardsAsync(int userId, int deckId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<DeckDto>> CopyAsync(int userId, int deckId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<DeckCsvFile>> ExportAsync(int userId, int deckId, CancellationToken cancellationToken = default);

    Task<DeckCardResult<ImportDeckResultDto>> ImportAsync(int userId, int deckId, string csv, CancellationToken cancellationToken = default);
}
