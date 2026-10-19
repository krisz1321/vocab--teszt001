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
        string? focus,
        string? tag,
        CancellationToken cancellationToken = default)
    {
        if (deckId is int selectedDeckId && !await OwnsDeckAsync(userId, selectedDeckId, cancellationToken))
        {
            return DeckCardResult<IReadOnlyList<FreeStudyCardDto>>.Fail(
                StatusCodes.Status404NotFound,
                "A pakli nem található.");
        }

        var cards = ApplyFocus(UserCards(userId, deckId, CardTags.NormalizeFilter(tag)), focus);
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
                Tags = card.Tags,
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
            return DeckCardResult<bool>.Fail(StatusCodes.Status404NotFound, "A kártya nem található.");
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

    public async Task<DeckCardResult<bool>> ClearMarkAsync(
        int userId,
        int cardId,
        CancellationToken cancellationToken = default)
    {
        var mark = await dbContext.FreeStudyMarks
            .FirstOrDefaultAsync(item => item.UserId == userId && item.CardId == cardId, cancellationToken);
        if (mark is null)
        {
            return DeckCardResult<bool>.Success(true);
        }

        dbContext.FreeStudyMarks.Remove(mark);
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<bool>.Success(true);
    }

    // Az újrakezdés csak a GetCardsAsync-szel azonos szűrésű (pakli, címke, fókusz) kártyák jelöléseit törli.
    public async Task<DeckCardResult<bool>> ClearMarksAsync(
        int userId,
        int? deckId,
        string? focus,
        string? tag,
        CancellationToken cancellationToken = default)
    {
        if (deckId is int selectedDeckId && !await OwnsDeckAsync(userId, selectedDeckId, cancellationToken))
        {
            return DeckCardResult<bool>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        var cardIds = ApplyFocus(UserCards(userId, deckId, CardTags.NormalizeFilter(tag)), focus)
            .Select(card => card.Id);
        await dbContext.FreeStudyMarks
            .Where(mark => mark.UserId == userId && cardIds.Contains(mark.CardId))
            .ExecuteDeleteAsync(cancellationToken);
        return DeckCardResult<bool>.Success(true);
    }

    private static IQueryable<Card> ApplyFocus(IQueryable<Card> cards, string? focus)
    {
        var normalizedFocus = focus?.Trim().ToLowerInvariant();
        if (normalizedFocus == "due")
        {
            var now = DateTime.UtcNow;
            return cards.Where(card => card.Progress != null
                && card.Progress.FirstReviewedAt != null
                && card.Progress.NextReviewDate <= now);
        }

        if (normalizedFocus == "mistakes")
        {
            return cards.Where(card => card.Progress != null && card.Progress.IncorrectCount > 0);
        }

        if (normalizedFocus == "new")
        {
            return cards.Where(card => card.Progress != null && card.Progress.FirstReviewedAt == null);
        }

        if (normalizedFocus == "reviewed")
        {
            // A Nyelvtan nézet "csak a már tanult szavak" szűrője: legalább egyszer ismételt kártyák.
            return cards.Where(card => card.Progress != null && card.Progress.FirstReviewedAt != null);
        }

        return cards;
    }

    private IQueryable<Card> UserCards(int userId, int? deckId, string? tag)
    {
        var now = DateTime.UtcNow;
        var cards = dbContext.Cards.AsNoTracking()
            .Where(card => card.Deck.UserId == userId
                && (card.Progress == null || card.Progress.SuspendedUntil == null || card.Progress.SuspendedUntil <= now));
        if (deckId is int selectedDeckId)
        {
            cards = cards.Where(card => card.DeckId == selectedDeckId);
        }

        if (tag is not null)
        {
            var pattern = "," + tag + ",";
            cards = cards.Where(card => card.Tags != null && ("," + card.Tags + ",").Contains(pattern));
        }

        return cards;
    }

    private Task<bool> OwnsDeckAsync(int userId, int deckId, CancellationToken cancellationToken) =>
        dbContext.Decks.AnyAsync(deck => deck.Id == deckId && deck.UserId == userId, cancellationToken);
}
