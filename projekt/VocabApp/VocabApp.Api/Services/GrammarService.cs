using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

// A Nyelvtan nézet beállítása és eredményei. Az SM-2-höz (CardProgress) nem nyúl.
public sealed class GrammarService(AppDbContext dbContext) : IGrammarService
{
    public async Task<DeckCardResult<GrammarTensesDto>> GetTensesAsync(int userId, CancellationToken cancellationToken = default)
    {
        var stored = await dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => user.SelectedGrammarTenses)
            .SingleOrDefaultAsync(cancellationToken);

        return stored is null
            ? DeckCardResult<GrammarTensesDto>.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.")
            : DeckCardResult<GrammarTensesDto>.Success(new GrammarTensesDto { Tenses = GrammarTenses.Parse(stored).ToList() });
    }

    public async Task<DeckCardResult<GrammarTensesDto>> SetTensesAsync(
        int userId,
        IReadOnlyCollection<string> tenses,
        CancellationToken cancellationToken = default)
    {
        if (tenses.Any(tense => !GrammarTenses.IsAllowed(tense)))
        {
            return DeckCardResult<GrammarTensesDto>.Fail(StatusCodes.Status400BadRequest, "Ismeretlen igeidő.");
        }

        var keys = GrammarTenses.Canonical(tenses);
        if (keys.Count == 0)
        {
            return DeckCardResult<GrammarTensesDto>.Fail(StatusCodes.Status400BadRequest, "Legalább egy igeidőt válassz ki.");
        }

        var user = await dbContext.Users.SingleOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (user is null)
        {
            return DeckCardResult<GrammarTensesDto>.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.");
        }

        user.SelectedGrammarTenses = string.Join(',', keys);
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<GrammarTensesDto>.Success(new GrammarTensesDto { Tenses = keys.ToList() });
    }

    public async Task<DeckCardResult<GrammarTranslationDto>> GetTranslationAsync(int userId, CancellationToken cancellationToken = default)
    {
        var enabled = await dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => (bool?)user.GrammarShowTranslation)
            .SingleOrDefaultAsync(cancellationToken);

        return enabled is null
            ? DeckCardResult<GrammarTranslationDto>.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.")
            : DeckCardResult<GrammarTranslationDto>.Success(new GrammarTranslationDto { Enabled = enabled.Value });
    }

    public async Task<DeckCardResult<GrammarTranslationDto>> SetTranslationAsync(
        int userId,
        bool enabled,
        CancellationToken cancellationToken = default)
    {
        var user = await dbContext.Users.SingleOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (user is null)
        {
            return DeckCardResult<GrammarTranslationDto>.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.");
        }

        user.GrammarShowTranslation = enabled;
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeckCardResult<GrammarTranslationDto>.Success(new GrammarTranslationDto { Enabled = enabled });
    }

    public async Task<int> RecordAttemptAsync(
        int userId,
        int cardId,
        string tense,
        GrammarCheckResponseDto result,
        CancellationToken cancellationToken = default)
    {
        var attempt = new GrammarAttempt
        {
            UserId = userId,
            CardId = cardId,
            Tense = tense,
            IsCorrect = result.IsCorrect,
            TermUsedCorrectly = result.TermUsedCorrectly,
            TenseCorrect = result.TenseCorrect,
            GrammarCorrect = result.GrammarCorrect,
            CreatedAt = DateTime.UtcNow
        };
        dbContext.GrammarAttempts.Add(attempt);
        await dbContext.SaveChangesAsync(cancellationToken);
        return attempt.Id;
    }

    // "Márpedig jó volt": a saját, MI szerint hibás eredmény kézzel helyesre vált. Idegen vagy nem létező → false (404).
    public async Task<bool> AcceptAttemptAsync(int userId, int attemptId, CancellationToken cancellationToken = default)
    {
        var attempt = await dbContext.GrammarAttempts
            .SingleOrDefaultAsync(item => item.Id == attemptId && item.UserId == userId, cancellationToken);
        if (attempt is null)
        {
            return false;
        }

        if (!attempt.IsCorrect)
        {
            attempt.IsCorrect = true;
            attempt.ManuallyAccepted = true;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return true;
    }
}
