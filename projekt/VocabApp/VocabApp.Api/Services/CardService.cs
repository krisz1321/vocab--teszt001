using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public sealed class CardService(AppDbContext dbContext) : ICardService
{
    private const int MaxTermLength = 100;
    private const int MaxTextLength = 500;
    private const int MaxTargetMeaningsLength = 200;

    public async Task<DeckCardResult<IReadOnlyList<CardDto>>> GetByDeckAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default)
    {
        var ownsDeck = await dbContext.Decks
            .AnyAsync(deck => deck.Id == deckId && deck.UserId == userId, cancellationToken);
        if (!ownsDeck)
        {
            return DeckCardResult<IReadOnlyList<CardDto>>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        var cards = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.DeckId == deckId)
            .OrderBy(card => card.Id)
            .Select(card => new CardDto
            {
                Id = card.Id,
                DeckId = card.DeckId,
                Term = card.Term,
                Definition = card.Definition,
                Example = card.Example,
                TargetMeanings = card.TargetMeanings
            })
            .ToListAsync(cancellationToken);

        return DeckCardResult<IReadOnlyList<CardDto>>.Success(cards);
    }

    public async Task<DeckCardResult<CardDto>> CreateAsync(
        int userId,
        CreateCardDto request,
        CancellationToken cancellationToken = default)
    {
        var validationError = ValidateText(request.Term, request.Definition, request.Example, request.TargetMeanings);
        if (validationError is not null)
        {
            return DeckCardResult<CardDto>.Fail(StatusCodes.Status400BadRequest, validationError);
        }

        var ownsDeck = await dbContext.Decks
            .AnyAsync(deck => deck.Id == request.DeckId && deck.UserId == userId, cancellationToken);
        if (!ownsDeck)
        {
            return DeckCardResult<CardDto>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        var card = new Card
        {
            DeckId = request.DeckId,
            Term = request.Term!.Trim(),
            Definition = request.Definition!.Trim(),
            Example = NormalizeOptional(request.Example),
            TargetMeanings = NormalizeOptional(request.TargetMeanings),
            Progress = new CardProgress
            {
                NextReviewDate = DateTime.UtcNow,
                EaseFactor = 2.5f,
                Interval = 0,
                Streak = 0,
                IncorrectCount = 0
            }
        };

        dbContext.Cards.Add(card);
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<CardDto>.Success(ToDto(card));
    }

    public async Task<DeckCardResult<CardDto>> UpdateAsync(
        int userId,
        int cardId,
        UpdateCardDto request,
        CancellationToken cancellationToken = default)
    {
        var validationError = ValidateText(request.Term, request.Definition, request.Example, request.TargetMeanings);
        if (validationError is not null)
        {
            return DeckCardResult<CardDto>.Fail(StatusCodes.Status400BadRequest, validationError);
        }

        var card = await dbContext.Cards
            .FirstOrDefaultAsync(candidate => candidate.Id == cardId && candidate.Deck.UserId == userId, cancellationToken);
        if (card is null)
        {
            return DeckCardResult<CardDto>.Fail(StatusCodes.Status404NotFound, "Card not found.");
        }

        card.Term = request.Term!.Trim();
        card.Definition = request.Definition!.Trim();
        card.Example = NormalizeOptional(request.Example);
        card.TargetMeanings = NormalizeOptional(request.TargetMeanings);
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<CardDto>.Success(ToDto(card));
    }

    public async Task<bool> DeleteAsync(int userId, int cardId, CancellationToken cancellationToken = default)
    {
        var card = await dbContext.Cards
            .FirstOrDefaultAsync(candidate => candidate.Id == cardId && candidate.Deck.UserId == userId, cancellationToken);
        if (card is null)
        {
            return false;
        }

        dbContext.Cards.Remove(card);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static string? ValidateText(string? term, string? definition, string? example, string? targetMeanings)
    {
        var normalizedTerm = term?.Trim();
        if (string.IsNullOrEmpty(normalizedTerm))
        {
            return "Term is required.";
        }

        if (normalizedTerm.Length > MaxTermLength)
        {
            return "Term must be at most 100 characters.";
        }

        var normalizedDefinition = definition?.Trim();
        if (string.IsNullOrEmpty(normalizedDefinition))
        {
            return "Definition is required.";
        }

        if (normalizedDefinition.Length > MaxTextLength)
        {
            return "Definition must be at most 500 characters.";
        }

        var normalizedExample = example?.Trim();
        if (!string.IsNullOrEmpty(normalizedExample) && normalizedExample.Length > MaxTextLength)
        {
            return "Example must be at most 500 characters.";
        }

        var normalizedMeanings = targetMeanings?.Trim();
        if (!string.IsNullOrEmpty(normalizedMeanings) && normalizedMeanings.Length > MaxTargetMeaningsLength)
        {
            return "Target meanings must be at most 200 characters.";
        }

        return null;
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrEmpty(normalized) ? null : normalized;
    }

    private static CardDto ToDto(Card card) => new()
    {
        Id = card.Id,
        DeckId = card.DeckId,
        Term = card.Term,
        Definition = card.Definition,
        Example = card.Example,
        TargetMeanings = card.TargetMeanings
    };
}
