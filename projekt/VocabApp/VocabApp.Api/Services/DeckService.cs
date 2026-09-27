using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public sealed class DeckService(AppDbContext dbContext) : IDeckService
{
    private const int MaxNameLength = 100;

    public async Task<IReadOnlyList<DeckDto>> GetAsync(int userId, CancellationToken cancellationToken = default)
    {
        return await dbContext.Decks
            .AsNoTracking()
            .Where(deck => deck.UserId == userId)
            .OrderBy(deck => deck.Id)
            .Select(deck => new DeckDto { Id = deck.Id, Name = deck.Name, IsPublic = deck.IsPublic })
            .ToListAsync(cancellationToken);
    }

    public async Task<DeckCardResult<DeckDto>> CreateAsync(
        int userId,
        CreateDeckDto request,
        CancellationToken cancellationToken = default)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "Name is required.");
        }

        if (name.Length > MaxNameLength)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "Name must be at most 100 characters.");
        }

        var deck = new Deck { UserId = userId, Name = name, IsPublic = false };
        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync(cancellationToken);

        return DeckCardResult<DeckDto>.Success(ToDto(deck));
    }

    public async Task<DeckCardResult<DeckDto>> RenameAsync(
        int userId,
        int deckId,
        RenameDeckDto request,
        CancellationToken cancellationToken = default)
    {
        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "Name is required.");
        }

        if (name.Length > MaxNameLength)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "Name must be at most 100 characters.");
        }

        var deck = await dbContext.Decks
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        deck.Name = name;
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<DeckDto>.Success(ToDto(deck));
    }

    public async Task<bool> DeleteAsync(int userId, int deckId, CancellationToken cancellationToken = default)
    {
        var deck = await dbContext.Decks
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return false;
        }

        dbContext.Decks.Remove(deck);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<DeckCardResult<DeckDto>> ShareAsync(
        int userId,
        int deckId,
        ShareDeckDto request,
        CancellationToken cancellationToken = default)
    {
        var deck = await dbContext.Decks
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        deck.IsPublic = request.IsPublic;
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<DeckDto>.Success(ToDto(deck));
    }

    public async Task<IReadOnlyList<PublicDeckDto>> GetPublicAsync(
        int userId,
        string? query,
        CancellationToken cancellationToken = default)
    {
        var term = query?.Trim();
        var decks = dbContext.Decks
            .AsNoTracking()
            .Where(deck => deck.IsPublic && deck.UserId != userId);

        if (!string.IsNullOrEmpty(term))
        {
            var lowered = term.ToLower();
            decks = decks.Where(deck => deck.Name.ToLower().Contains(lowered));
        }

        return await decks
            .OrderBy(deck => deck.Name)
            .ThenBy(deck => deck.Id)
            .Select(deck => new PublicDeckDto
            {
                Id = deck.Id,
                Name = deck.Name,
                CardCount = deck.Cards.Count,
                OwnerEmail = deck.User.Email
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<DeckCardResult<DeckDto>> CopyAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default)
    {
        var source = await dbContext.Decks
            .AsNoTracking()
            .Include(deck => deck.Cards)
            .FirstOrDefaultAsync(
                deck => deck.Id == deckId && deck.IsPublic && deck.UserId != userId,
                cancellationToken);
        if (source is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        var now = DateTime.UtcNow;
        var copy = new Deck
        {
            UserId = userId,
            Name = source.Name,
            IsPublic = false,
            Cards = source.Cards.Select(card => new Card
            {
                Term = card.Term,
                Definition = card.Definition,
                Example = card.Example,
                TargetMeanings = card.TargetMeanings,
                Progress = new CardProgress
                {
                    EaseFactor = 2.5f,
                    Interval = 0,
                    Streak = 0,
                    IncorrectCount = 0,
                    NextReviewDate = now
                }
            }).ToList()
        };

        dbContext.Decks.Add(copy);
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<DeckDto>.Success(ToDto(copy));
    }

    public async Task<DeckCardResult<DeckCsvFile>> ExportAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default)
    {
        var deck = await dbContext.Decks
            .AsNoTracking()
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return DeckCardResult<DeckCsvFile>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        var cards = await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.DeckId == deckId)
            .OrderBy(card => card.Id)
            .Select(card => new { card.Term, card.Definition, card.Example, card.TargetMeanings })
            .ToListAsync(cancellationToken);

        return DeckCardResult<DeckCsvFile>.Success(new DeckCsvFile
        {
            FileName = DeckCsv.ToFileName(deck.Name),
            Content = DeckCsv.Write(cards.Select(card => new DeckCsvRow(card.Term, card.Definition, card.Example, card.TargetMeanings)))
        });
    }

    public async Task<DeckCardResult<ImportDeckResultDto>> ImportAsync(
        int userId,
        int deckId,
        string csv,
        CancellationToken cancellationToken = default)
    {
        var ownsDeck = await dbContext.Decks
            .AnyAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (!ownsDeck)
        {
            return DeckCardResult<ImportDeckResultDto>.Fail(StatusCodes.Status404NotFound, "Deck not found.");
        }

        if (!DeckCsv.TryRead(csv, out var rows, out var error))
        {
            return DeckCardResult<ImportDeckResultDto>.Fail(StatusCodes.Status400BadRequest, error ?? "The CSV file is invalid.");
        }

        var now = DateTime.UtcNow;
        foreach (var row in rows)
        {
            dbContext.Cards.Add(new Card
            {
                DeckId = deckId,
                Term = row.Term,
                Definition = row.Definition,
                Example = row.Example,
                TargetMeanings = row.TargetMeanings,
                Progress = new CardProgress
                {
                    EaseFactor = 2.5f,
                    Interval = 0,
                    Streak = 0,
                    IncorrectCount = 0,
                    NextReviewDate = now
                }
            });
        }

        if (rows.Count > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return DeckCardResult<ImportDeckResultDto>.Success(new ImportDeckResultDto { ImportedCount = rows.Count });
    }

    private static DeckDto ToDto(Deck deck) => new()
    {
        Id = deck.Id,
        Name = deck.Name,
        IsPublic = deck.IsPublic
    };
}
