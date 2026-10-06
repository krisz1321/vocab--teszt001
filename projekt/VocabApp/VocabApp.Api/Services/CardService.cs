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
    private const int KnownStreak = 3;
    private const int KnownIntervalDays = 15;

    public async Task<DeckCardResult<IReadOnlyList<CardDto>>> GetByDeckAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default)
    {
        var ownsDeck = await dbContext.Decks
            .AnyAsync(deck => deck.Id == deckId && deck.UserId == userId, cancellationToken);
        if (!ownsDeck)
        {
            return DeckCardResult<IReadOnlyList<CardDto>>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
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
                TargetMeanings = card.TargetMeanings,
                IsLearned = card.Progress != null && card.Progress.LearnedAt != null,
                MarkedKnown = card.Progress != null && card.Progress.MarkedKnown
            })
            .ToListAsync(cancellationToken);

        return DeckCardResult<IReadOnlyList<CardDto>>.Success(cards);
    }

    public async Task<IReadOnlyList<LearnedCardDto>> GetLearnedAsync(
        int userId,
        CancellationToken cancellationToken = default)
    {
        var rows = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.Deck.UserId == userId && card.Progress != null && card.Progress.LearnedAt != null)
            .OrderByDescending(card => card.Progress!.LearnedAt)
            .Select(card => new
            {
                card.Id,
                card.Term,
                card.Definition,
                card.Example,
                card.TargetMeanings,
                DeckName = card.Deck.Name,
                LearnedAt = card.Progress!.LearnedAt,
                FirstReviewedAt = card.Progress!.FirstReviewedAt,
                LastReviewedAt = card.Progress!.LastReviewedAt,
                NextReviewDate = card.Progress!.NextReviewDate,
                Streak = card.Progress!.Streak,
                Interval = card.Progress!.Interval,
                EaseFactor = card.Progress!.EaseFactor,
                CorrectCount = card.Progress!.CorrectCount,
                IncorrectCount = card.Progress!.IncorrectCount,
                MarkedKnown = card.Progress!.MarkedKnown
            })
            .ToListAsync(cancellationToken);

        return rows.Select(row => new LearnedCardDto
        {
            Id = row.Id,
            Term = row.Term,
            Definition = row.Definition,
            Example = row.Example,
            TargetMeanings = row.TargetMeanings,
            DeckName = row.DeckName,
            LearnedAt = AsUtc(row.LearnedAt!.Value),
            FirstReviewedAt = row.FirstReviewedAt is null ? null : AsUtc(row.FirstReviewedAt.Value),
            LastReviewedAt = row.LastReviewedAt is null ? null : AsUtc(row.LastReviewedAt.Value),
            NextReviewDate = AsUtc(row.NextReviewDate),
            Streak = row.Streak,
            Interval = row.Interval,
            EaseFactor = row.EaseFactor,
            CorrectCount = row.CorrectCount,
            IncorrectCount = row.IncorrectCount,
            MarkedKnown = row.MarkedKnown
        }).ToList();
    }

    private static DateTime AsUtc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

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
            return DeckCardResult<CardDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
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
            .Include(candidate => candidate.Progress)
            .FirstOrDefaultAsync(candidate => candidate.Id == cardId && candidate.Deck.UserId == userId, cancellationToken);
        if (card is null)
        {
            return DeckCardResult<CardDto>.Fail(StatusCodes.Status404NotFound, "A kártya nem található.");
        }

        card.Term = request.Term!.Trim();
        card.Definition = request.Definition!.Trim();
        card.Example = NormalizeOptional(request.Example);
        card.TargetMeanings = NormalizeOptional(request.TargetMeanings);
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<CardDto>.Success(ToDto(card));
    }

    public async Task<DeckCardResult<CardDto>> SetKnownAsync(
        int userId,
        int cardId,
        bool known,
        CancellationToken cancellationToken = default)
    {
        var card = await dbContext.Cards
            .Include(candidate => candidate.Progress)
            .FirstOrDefaultAsync(candidate => candidate.Id == cardId && candidate.Deck.UserId == userId, cancellationToken);
        if (card?.Progress is null)
        {
            return DeckCardResult<CardDto>.Fail(StatusCodes.Status404NotFound, "A kártya nem található.");
        }

        var progress = card.Progress;
        var now = DateTime.UtcNow;
        if (known)
        {
            if (progress.LearnedAt is null)
            {
                progress.MarkedKnown = true;
                progress.LearnedAt = now;
                progress.Streak = KnownStreak;
                progress.Interval = KnownIntervalDays;
                progress.NextReviewDate = now.AddDays(KnownIntervalDays);
                if (progress.FirstReviewedAt is null)
                {
                    progress.FirstReviewedAt = now.AddDays(-1);
                }
            }
        }
        else if (progress.MarkedKnown && progress.CorrectCount == 0 && progress.IncorrectCount == 0)
        {
            progress.MarkedKnown = false;
            progress.LearnedAt = null;
            progress.Streak = 0;
            progress.Interval = 0;
            progress.FirstReviewedAt = null;
            progress.NextReviewDate = now;
        }

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

    public async Task<bool> ResetLearnedAsync(int userId, int cardId, CancellationToken cancellationToken = default)
    {
        var card = await dbContext.Cards
            .Include(candidate => candidate.Progress)
            .FirstOrDefaultAsync(
                candidate => candidate.Id == cardId && candidate.Deck.UserId == userId && candidate.Progress!.LearnedAt != null,
                cancellationToken);
        if (card?.Progress is null)
        {
            return false;
        }

        var progress = card.Progress;
        progress.LearnedAt = null;
        progress.MarkedKnown = false;
        progress.Streak = 0;
        progress.Interval = 0;
        progress.NextReviewDate = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static string? ValidateText(string? term, string? definition, string? example, string? targetMeanings)
    {
        var normalizedTerm = term?.Trim();
        if (string.IsNullOrEmpty(normalizedTerm))
        {
            return "A szó megadása kötelező.";
        }

        if (normalizedTerm.Length > MaxTermLength)
        {
            return "A szó legfeljebb 100 karakter lehet.";
        }

        var normalizedDefinition = definition?.Trim();
        if (string.IsNullOrEmpty(normalizedDefinition))
        {
            return "A definíció megadása kötelező.";
        }

        if (normalizedDefinition.Length > MaxTextLength)
        {
            return "A definíció legfeljebb 500 karakter lehet.";
        }

        var normalizedExample = example?.Trim();
        if (!string.IsNullOrEmpty(normalizedExample) && normalizedExample.Length > MaxTextLength)
        {
            return "A példa legfeljebb 500 karakter lehet.";
        }

        var normalizedMeanings = targetMeanings?.Trim();
        if (!string.IsNullOrEmpty(normalizedMeanings) && normalizedMeanings.Length > MaxTargetMeaningsLength)
        {
            return "A célnyelvi jelentés legfeljebb 200 karakter lehet.";
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
        TargetMeanings = card.TargetMeanings,
        IsLearned = card.Progress?.LearnedAt != null,
        MarkedKnown = card.Progress?.MarkedKnown == true
    };
}
