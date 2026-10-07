using System.Globalization;
using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public sealed class DeckService(AppDbContext dbContext) : IDeckService
{
    private const int MaxNameLength = DeckLimits.MaxNameLength;
    private const string DescriptionTooLong = "A pakli leírása legfeljebb 500 karakter lehet.";

    public Task<IReadOnlyList<DeckDto>> GetAsync(int userId, CancellationToken cancellationToken = default) =>
        BuildDtosAsync(dbContext.Decks.Where(deck => deck.UserId == userId), cancellationToken);

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

        var description = DeckLimits.NormalizeDescription(request.Description);
        if (description is { Length: > DeckLimits.MaxDescriptionLength })
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, DescriptionTooLong);
        }

        var deck = new Deck { UserId = userId, Name = name, Description = description };
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

    public async Task<DeckCardResult<DeckDto>> UpdateDescriptionAsync(
        int userId,
        int deckId,
        UpdateDeckDescriptionDto request,
        CancellationToken cancellationToken = default)
    {
        var description = DeckLimits.NormalizeDescription(request.Description);
        if (description is { Length: > DeckLimits.MaxDescriptionLength })
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, DescriptionTooLong);
        }

        var deck = await dbContext.Decks
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        deck.Description = description;
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

        var share = await dbContext.SharedDecks
            .Include(candidate => candidate.Cards)
            .FirstOrDefaultAsync(candidate => candidate.SourceDeckId == deck.Id, cancellationToken);

        if (!request.IsPublic)
        {
            if (share is { IsActive: true })
            {
                share.IsActive = false;
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return DeckCardResult<DeckDto>.Success(await ToDtoAsync(deck, cancellationToken));
        }

        if (!string.IsNullOrWhiteSpace(request.ExampleLevel))
        {
            var level = request.ExampleLevel.Trim();
            if (!ExampleLevels.IsAllowed(level))
            {
                return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "A mondatszint érvénytelen.");
            }

            deck.ExampleLevel = level;
        }

        if (share is { IsActive: true })
        {
            // Már megosztott pakli: a tartalmat csak a külön "Megosztás frissítése" művelet írja felül.
            await dbContext.SaveChangesAsync(cancellationToken);
            return DeckCardResult<DeckDto>.Success(await ToDtoAsync(deck, cancellationToken));
        }

        var cards = await LoadDeckCardsAsync(deck.Id, cancellationToken);
        if (cards.Count == 0)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "Üres paklit nem lehet megosztani.");
        }

        var now = DateTime.UtcNow;
        var hash = HashOf(deck, cards);
        if (share is null)
        {
            share = new SharedDeck
            {
                OwnerId = userId,
                SourceDeckId = deck.Id,
                Version = 1,
                SharedAt = now,
                UpdatedAt = now
            };
            dbContext.SharedDecks.Add(share);
            ApplySnapshot(share, deck, cards, hash);
        }
        else if (share.ContentHash != hash)
        {
            // Újra megosztott pakli, ami a megszüntetés óta módosult: új verzióként kerül ki.
            ApplySnapshot(share, deck, cards, hash);
            share.Version++;
            share.UpdatedAt = now;
        }

        share.IsActive = true;
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<DeckDto>.Success(await ToDtoAsync(deck, cancellationToken));
    }

    public async Task<DeckCardResult<DeckDto>> PublishUpdateAsync(
        int userId,
        int deckId,
        CancellationToken cancellationToken = default)
    {
        var deck = await dbContext.Decks
            .FirstOrDefaultAsync(candidate => candidate.Id == deckId && candidate.UserId == userId, cancellationToken);
        if (deck is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        var share = await dbContext.SharedDecks
            .Include(candidate => candidate.Cards)
            .FirstOrDefaultAsync(candidate => candidate.SourceDeckId == deck.Id && candidate.IsActive, cancellationToken);
        if (share is null)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status409Conflict, "A pakli nincs megosztva.");
        }

        var cards = await LoadDeckCardsAsync(deck.Id, cancellationToken);
        if (cards.Count == 0)
        {
            return DeckCardResult<DeckDto>.Fail(StatusCodes.Status400BadRequest, "Üres paklit nem lehet megosztani.");
        }

        var hash = HashOf(deck, cards);
        if (hash == share.ContentHash)
        {
            return DeckCardResult<DeckDto>.Fail(
                StatusCodes.Status409Conflict,
                "Nincs mit frissíteni: a pakli megegyezik a megosztott verzióval.");
        }

        ApplySnapshot(share, deck, cards, hash);
        share.Version++;
        share.UpdatedAt = DateTime.UtcNow;
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
        string? owner,
        string? sort,
        bool descending,
        CancellationToken cancellationToken = default)
    {
        var rows = await dbContext.SharedDecks
            .AsNoTracking()
            .Where(share => share.IsActive && share.OwnerId != userId)
            .Select(share => new PublicDeckDto
            {
                Id = share.Id,
                Name = share.Name,
                Description = share.Description,
                CardCount = share.Cards.Count,
                OwnerUsername = share.Owner.Username,
                ExampleLevel = share.ExampleLevel ?? share.Owner.ExampleLevel,
                LevelIsAutomatic = share.ExampleLevel == null,
                Version = share.Version,
                SharedAt = share.SharedAt,
                UpdatedAt = share.UpdatedAt,
                SaveCount = share.Saves.Count,
                AlreadySaved = share.Saves.Any(save => save.UserId == userId)
            })
            .ToListAsync(cancellationToken);

        foreach (var row in rows)
        {
            row.SharedAt = Utc(row.SharedAt);
            row.UpdatedAt = Utc(row.UpdatedAt);
        }

        // A szűrés és a rendezés a memóriában fut: az SQLite ToLower()/LIKE és a rendezés csak az ASCII betűket
        // kezeli kis- és nagybetű-függetlenül, így a nagy ékezetes betűvel kezdődő nevek (pl. "Ősz") nem találódnának meg.
        IEnumerable<PublicDeckDto> result = rows;

        var term = query?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            result = result.Where(deck => deck.Name.Contains(term, StringComparison.OrdinalIgnoreCase)
                || (deck.Description?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false));
        }

        var ownerTerm = owner?.Trim();
        if (!string.IsNullOrEmpty(ownerTerm))
        {
            result = result.Where(deck => deck.OwnerUsername.Contains(ownerTerm, StringComparison.OrdinalIgnoreCase));
        }

        return Sort(result, sort, descending).ToList();
    }

    public async Task<DeckCardResult<IReadOnlyList<CardDto>>> GetPublicCardsAsync(
        int userId,
        int sharedDeckId,
        CancellationToken cancellationToken = default)
    {
        var isShared = await dbContext.SharedDecks
            .AsNoTracking()
            .AnyAsync(share => share.Id == sharedDeckId && share.IsActive && share.OwnerId != userId, cancellationToken);
        if (!isShared)
        {
            return DeckCardResult<IReadOnlyList<CardDto>>.Fail(StatusCodes.Status404NotFound, "A pakli nem található.");
        }

        var cards = await dbContext.SharedDeckCards
            .AsNoTracking()
            .Where(card => card.SharedDeckId == sharedDeckId)
            .OrderBy(card => card.Id)
            .Select(card => new CardDto
            {
                Id = card.Id,
                DeckId = card.SharedDeckId,
                Term = card.Term,
                Definition = card.Definition,
                Example = card.Example,
                TargetMeanings = card.TargetMeanings,
                Tags = card.Tags
            })
            .ToListAsync(cancellationToken);

        return DeckCardResult<IReadOnlyList<CardDto>>.Success(cards);
    }

    public async Task<DeckCardResult<DeckDto>> CopyAsync(
        int userId,
        int sharedDeckId,
        CancellationToken cancellationToken = default)
    {
        var source = await dbContext.SharedDecks
            .AsNoTracking()
            .Include(share => share.Cards)
            .FirstOrDefaultAsync(
                share => share.Id == sharedDeckId && share.IsActive && share.OwnerId != userId,
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
            Description = source.Description,
            ExampleLevel = source.ExampleLevel,
            SourceSharedDeckId = source.Id,
            SourceVersion = source.Version,
            Cards = source.Cards.OrderBy(card => card.Id).Select(card => new Card
            {
                Term = card.Term,
                Definition = card.Definition,
                Example = card.Example,
                TargetMeanings = card.TargetMeanings,
                Tags = card.Tags,
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

        // Felhasználónként egyetlen mentés számít, akárhányszor másolja le valaki a paklit.
        var save = await dbContext.SharedDeckSaves
            .FirstOrDefaultAsync(candidate => candidate.SharedDeckId == source.Id && candidate.UserId == userId, cancellationToken);
        if (save is null)
        {
            dbContext.SharedDeckSaves.Add(new SharedDeckSave
            {
                SharedDeckId = source.Id,
                UserId = userId,
                FirstSavedAt = now,
                LastSavedAt = now
            });
        }
        else
        {
            save.LastSavedAt = now;
        }

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
            .Select(card => new { card.Term, card.Definition, card.Example, card.TargetMeanings, card.Tags })
            .ToListAsync(cancellationToken);

        return DeckCardResult<DeckCsvFile>.Success(new DeckCsvFile
        {
            FileName = DeckCsv.ToFileName(deck.Name),
            Content = DeckCsv.Write(cards.Select(card => new DeckCsvRow(card.Term, card.Definition, card.Example, card.TargetMeanings, card.Tags)))
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

        if (!DeckCsv.TryRead(csv, out var rows, out var skipped, out var error))
        {
            return DeckCardResult<ImportDeckResultDto>.Fail(StatusCodes.Status400BadRequest, error ?? "A CSV fájl érvénytelen.");
        }

        if (rows.Count == 0 && skipped.Count > 0)
        {
            return DeckCardResult<ImportDeckResultDto>.Fail(
                StatusCodes.Status400BadRequest,
                $"Egyetlen sor sem volt importálható. {skipped[0]}");
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
                Tags = row.Tags,
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

        return DeckCardResult<ImportDeckResultDto>.Success(new ImportDeckResultDto
        {
            ImportedCount = rows.Count,
            SkippedCount = skipped.Count,
            SkippedRows = skipped.Take(10).ToList()
        });
    }

    private async Task<DeckDto> ToDtoAsync(Deck deck, CancellationToken cancellationToken) =>
        (await BuildDtosAsync(dbContext.Decks.Where(candidate => candidate.Id == deck.Id), cancellationToken)).Single();

    private async Task<IReadOnlyList<DeckDto>> BuildDtosAsync(IQueryable<Deck> decks, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var rows = await decks
            .AsNoTracking()
            .OrderBy(deck => deck.Id)
            .Select(deck => new
            {
                deck.Id,
                deck.Name,
                deck.Description,
                deck.ExampleLevel,
                CardCount = deck.Cards.Count,
                LearnedCount = deck.Cards.Count(card => card.Progress != null && card.Progress.LearnedAt != null),
                DueCount = deck.Cards.Count(card => card.Progress != null
                    && card.Progress.FirstReviewedAt != null
                    && card.Progress.NextReviewDate <= now
                    && (card.Progress.SuspendedUntil == null || card.Progress.SuspendedUntil <= now)),
                ShareId = (int?)deck.SharedDeck!.Id,
                ShareIsActive = deck.SharedDeck != null && deck.SharedDeck.IsActive,
                ShareVersion = (int?)deck.SharedDeck!.Version,
                ShareSharedAt = (DateTime?)deck.SharedDeck!.SharedAt,
                ShareUpdatedAt = (DateTime?)deck.SharedDeck!.UpdatedAt,
                ShareHash = deck.SharedDeck!.ContentHash,
                SaveCount = deck.SharedDeck != null ? deck.SharedDeck.Saves.Count : 0,
                deck.SourceSharedDeckId,
                deck.SourceVersion,
                SourceIsActive = deck.SourceSharedDeck != null && deck.SourceSharedDeck.IsActive,
                SourceLatestVersion = (int?)deck.SourceSharedDeck!.Version
            })
            .ToListAsync(cancellationToken);

        // A "módosult a közzététel óta" jelzéshez a megosztott paklik jelenlegi tartalmát hasonlítjuk a pillanatképhez.
        var activeDeckIds = rows.Where(row => row.ShareIsActive).Select(row => row.Id).ToList();
        var cardsByDeck = new Dictionary<int, List<SnapshotCard>>();
        if (activeDeckIds.Count > 0)
        {
            var cardRows = await dbContext.Cards
                .AsNoTracking()
                .Where(card => activeDeckIds.Contains(card.DeckId))
                .OrderBy(card => card.Id)
                .Select(card => new { card.DeckId, card.Term, card.Definition, card.Example, card.TargetMeanings, card.Tags })
                .ToListAsync(cancellationToken);
            foreach (var card in cardRows)
            {
                if (!cardsByDeck.TryGetValue(card.DeckId, out var list))
                {
                    list = [];
                    cardsByDeck[card.DeckId] = list;
                }

                list.Add(new SnapshotCard(card.Term, card.Definition, card.Example, card.TargetMeanings, card.Tags));
            }
        }

        return rows.Select(row =>
        {
            SharedInfoDto? share = null;
            if (row.ShareId is not null)
            {
                var changed = row.ShareIsActive
                    && SharedDeckSnapshot.ComputeHash(
                        row.Name,
                        row.Description,
                        row.ExampleLevel,
                        cardsByDeck.GetValueOrDefault(row.Id) ?? []) != row.ShareHash;
                share = new SharedInfoDto
                {
                    Version = row.ShareVersion ?? 1,
                    SharedAt = Utc(row.ShareSharedAt ?? now),
                    UpdatedAt = Utc(row.ShareUpdatedAt ?? now),
                    SaveCount = row.SaveCount,
                    IsActive = row.ShareIsActive,
                    HasUnpublishedChanges = changed
                };
            }

            return new DeckDto
            {
                Id = row.Id,
                Name = row.Name,
                Description = row.Description,
                CardCount = row.CardCount,
                LearnedCount = row.LearnedCount,
                DueCount = row.DueCount,
                IsPublic = row.ShareIsActive,
                ExampleLevel = row.ExampleLevel,
                Share = share,
                SourceSharedDeckId = row.SourceIsActive ? row.SourceSharedDeckId : null,
                SourceVersion = row.SourceVersion,
                LatestSharedVersion = row.SourceIsActive ? row.SourceLatestVersion : null,
                UpdateAvailable = row.SourceVersion is not null
                    && row.SourceIsActive
                    && row.SourceLatestVersion > row.SourceVersion
            };
        }).ToList();
    }

    private async Task<List<Card>> LoadDeckCardsAsync(int deckId, CancellationToken cancellationToken) =>
        await dbContext.Cards
            .AsNoTracking()
            .Where(card => card.DeckId == deckId)
            .OrderBy(card => card.Id)
            .ToListAsync(cancellationToken);

    private static string HashOf(Deck deck, IEnumerable<Card> cards) =>
        SharedDeckSnapshot.ComputeHash(
            deck.Name,
            deck.Description,
            deck.ExampleLevel,
            cards.Select(card => SharedDeckSnapshot.ToSnapshot(card)));

    /// <summary>A pillanatkép tartalmát a pakli jelenlegi állapotára cseréli (a verziót a hívó kezeli).</summary>
    private void ApplySnapshot(SharedDeck share, Deck deck, IEnumerable<Card> cards, string hash)
    {
        share.Name = deck.Name;
        share.Description = deck.Description;
        share.ExampleLevel = deck.ExampleLevel;
        share.ContentHash = hash;

        dbContext.SharedDeckCards.RemoveRange(share.Cards.ToList());
        share.Cards.Clear();
        foreach (var card in cards)
        {
            share.Cards.Add(SharedDeckSnapshot.ToSharedCard(card));
        }
    }

    // A SQLite visszaolvasáskor Unspecified idővel tér vissza: a JSON-ba "Z"-vel megy ki, hogy a böngésző helyi időre váltson.
    private static DateTime Utc(DateTime value) => DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static IEnumerable<PublicDeckDto> Sort(IEnumerable<PublicDeckDto> decks, string? sort, bool descending)
    {
        var nameComparer = StringComparer.Create(new CultureInfo("hu-HU"), ignoreCase: true);

        IOrderedEnumerable<PublicDeckDto> Order<TKey>(Func<PublicDeckDto, TKey> key, IComparer<TKey>? comparer = null) =>
            descending ? decks.OrderByDescending(key, comparer) : decks.OrderBy(key, comparer);

        var ordered = sort?.Trim().ToLowerInvariant() switch
        {
            "saves" => Order(deck => deck.SaveCount),
            "sharedat" => Order(deck => deck.SharedAt),
            "updatedat" => Order(deck => deck.UpdatedAt),
            "cards" => Order(deck => deck.CardCount),
            "version" => Order(deck => deck.Version),
            _ => Order(deck => deck.Name, nameComparer)
        };

        return ordered.ThenBy(deck => deck.Name, nameComparer).ThenBy(deck => deck.Id);
    }
}
