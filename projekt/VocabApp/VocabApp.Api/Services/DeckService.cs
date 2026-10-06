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
            .Select(deck => new DeckDto
            {
                Id = deck.Id,
                Name = deck.Name,
                CardCount = deck.Cards.Count,
                IsPublic = deck.IsPublic,
                ExampleLevel = deck.ExampleLevel
            })
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
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "A pakli nevének megadása kötelező.");
        }

        if (name.Length > MaxNameLength)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "A pakli neve legfeljebb 100 karakter lehet.");
        }

        var deck = new Deck { UserId = userId, Name = name, IsPublic = false };
        dbContext.Decks.Add(deck);
        await dbContext.SaveChangesAsync(cancellationToken);

        return DeckCardResult<DeckDto>.Success(await ToDtoAsync(deck, cancellationToken));
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
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "A pakli nevének megadása kötelező.");
        }

        if (name.Length > MaxNameLength)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "A pakli neve legfeljebb 100 karakter lehet.");
        }

        var deck = await dbContext.Decks
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        deck.Name = name;
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<DeckDto>.Success(await ToDtoAsync(deck, cancellationToken));
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
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        if (request.IsPublic && !string.IsNullOrWhiteSpace(request.ExampleLevel))
        {
            var level = request.ExampleLevel.Trim();
            if (!ExampleLevels.IsAllowed(level))
            {
                return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "A mondatszint érvénytelen.");
            }

            deck.ExampleLevel = level;
        }

        deck.IsPublic = request.IsPublic;
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<DeckDto>.Success(await ToDtoAsync(deck, cancellationToken));
    }

    public async Task<DeckCardResult<DeckDto>> UpdateExampleLevelAsync(
        int userId,
        int deckId,
        UpdateDeckExampleLevelDto request,
        CancellationToken cancellationToken = default)
    {
        string? exampleLevel = null;
        if (request.ExampleLevel is not null)
        {
            exampleLevel = request.ExampleLevel.Trim();
            if (!ExampleLevels.IsAllowed(exampleLevel))
            {
                return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "A mondatszint érvénytelen.");
            }
        }

        var deck = await dbContext.Decks
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        deck.ExampleLevel = exampleLevel;
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<DeckDto>.Success(await ToDtoAsync(deck, cancellationToken));
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

        var result = await decks
            .OrderBy(deck => deck.Name)
            .ThenBy(deck => deck.Id)
            .Select(deck => new PublicDeckDto
            {
                Id = deck.Id,
                Name = deck.Name,
                CardCount = deck.Cards.Count,
                OwnerEmail = deck.User.Email,
                ExampleLevel = deck.ExampleLevel ?? deck.User.ExampleLevel,
                LevelIsAutomatic = deck.ExampleLevel == null
            })
            .ToListAsync(cancellationToken);

        if (string.IsNullOrEmpty(term))
        {
            return result;
        }

        // A szűrés a memóriában fut: az SQLite ToLower()/LIKE csak az ASCII betűket kezeli kis- és
        // nagybetű-függetlenül, így a nagy ékezetes betűvel kezdődő nevek (pl. "Ősz") nem találódnának meg.
        return result
            .Where(deck => deck.Name.Contains(term, StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    public async Task<DeckCardResult<IReadOnlyList<CardDto>>> GetPublicCardsAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default)
    {
        var isShared = await dbContext.Decks
            .AsNoTracking()
            .AnyAsync(deck => deck.Id == deckId && deck.IsPublic && deck.UserId != userId, cancellationToken);
        if (!isShared)
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
                TargetMeanings = card.TargetMeanings
            })
            .ToListAsync(cancellationToken);

        return DeckCardResult<IReadOnlyList<CardDto>>.Success(cards);
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
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        var now = DateTime.UtcNow;
        var copy = new Deck
        {
            UserId = userId,
            Name = source.Name,
            IsPublic = false,
            ExampleLevel = source.ExampleLevel,
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
        return DeckCardResult<DeckDto>.Success(await ToDtoAsync(copy, cancellationToken));
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
            return DeckCardResult<DeckCsvFile>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
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
            return DeckCardResult<ImportDeckResultDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        if (!DeckCsv.TryRead(csv, out var rows, out var error))
        {
            return DeckCardResult<ImportDeckResultDto>.Fail(StatusCodes.Status400BadRequest, error ?? "A CSV fájl érvénytelen.");
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

    private async Task<DeckDto> ToDtoAsync(Deck deck, CancellationToken cancellationToken) => new()
    {
        Id = deck.Id,
        Name = deck.Name,
        CardCount = await dbContext.Cards.CountAsync(card => card.DeckId == deck.Id, cancellationToken),
        IsPublic = deck.IsPublic,
        ExampleLevel = deck.ExampleLevel
    };
}
