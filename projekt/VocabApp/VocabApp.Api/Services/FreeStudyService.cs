using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public sealed class FreeStudyService(AppDbContext dbContext) : IFreeStudyService
{
    public async Task<DeckCardResult<IReadOnlyList<FreeStudyCardDto>>> GetCardsAsync(
        int userId,
        int? deckId,
        CancellationToken cancellationToken = default)
    {
        if (deckId is int selectedDeckId && !await OwnsDeckAsync(userId, selectedDeckId, cancellationToken))
        {
            return DeckCardResult<IReadOnlyList<FreeStudyCardDto>>.Fail(
                StatusCodes.Status404NotFound,
                "Deck not found.");
        }

        var cards = UserCards(userId, deckId);
        var marks = dbContext.FreeStudyMarks.Where(mark => mark.UserId == userId);
        var list = await (
            from card in cards
            join mark in marks on card.Id equals mark.CardId into cardMarks
            from mark in cardMarks.DefaultIfEmpty()
            orderby card.Id
            select new FreeStudyCardDto
            {
                Id = card.Id,
                Term = card.Term,
                TargetMeanings = card.TargetMeanings,
                Definition = card.Definition,
                Example = card.Example,
                Knows = mark == null ? null : mark.Knows
            }).ToListAsync(cancellationToken);

        return DeckCardResult<IReadOnlyList<FreeStudyCardDto>>.Success(list);
    }

    public async Task<DeckCardResult<bool>> MarkAsync(
        int userId,
        int cardId,
        bool knows,
        CancellationToken cancellationToken = default)
    {
        var ownsCard = await dbContext.Cards
            .AnyAsync(card => card.Id == cardId && card.Deck.UserId == userId, cancellationToken);
        if (!ownsCard)
        {
            return DeckCardResult<bool>.Fail(StatusCodes.Status404NotFound, "Card not found.");
        }

        var mark = await dbContext.FreeStudyMarks
            .FirstOrDefaultAsync(item => item.UserId == userId && item.CardId == cardId, cancellationToken);
        if (mark is null)
        {
            dbContext.FreeStudyMarks.Add(new FreeStudyMark
            {
                UserId = userId,
                CardId = cardId,
                Knows = knows
            });
        }
        else
        {
            mark.Knows = knows;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<bool>.Success(true);
    }

    public async Task<DeckCardResult<bool>> ClearMarksAsync(
        int userId,
        int? deckId,
        CancellationToken cancellationToken = default)
    {
        if (deckId is int selectedDeckId && !await OwnsDeckAsync(userId, selectedDeckId, cancellationToken))
        {
            return DeckCardResult<bool>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        var marks = dbContext.FreeStudyMarks.Where(mark => mark.UserId == userId);
        if (deckId is int selectedId)
        {
            var cardIds = dbContext.Cards
                .Where(card => card.DeckId == selectedId)
                .Select(card => card.Id);
            marks = marks.Where(mark => cardIds.Contains(mark.CardId));
        }

        await marks.ExecuteDeleteAsync(cancellationToken);
        return DeckCardResult<bool>.Success(true);
    }

    private IQueryable<Card> UserCards(int userId, int? deckId)
    {
        var cards = dbContext.Cards.AsNoTracking().Where(card => card.Deck.UserId == userId);
        if (deckId is int selectedDeckId)
        {
            cards = cards.Where(card => card.DeckId == selectedDeckId);
        }

        return cards;
    }

    private Task<bool> OwnsDeckAsync(int userId, int deckId, CancellationToken cancellationToken) =>
        dbContext.Decks.AnyAsync(deck => deck.Id == deckId && deck.UserId == userId, cancellationToken);
}
