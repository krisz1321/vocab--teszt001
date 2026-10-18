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

    public async Task RecordAttemptAsync(
        int userId,
        int cardId,
        string tense,
        GrammarCheckResponseDto result,
        CancellationToken cancellationToken = default)
    {
        dbContext.GrammarAttempts.Add(new GrammarAttempt
        {
            UserId = userId,
            CardId = cardId,
            Tense = tense,
            IsCorrect = result.IsCorrect,
            TermUsedCorrectly = result.TermUsedCorrectly,
            TenseCorrect = result.TenseCorrect,
            GrammarCorrect = result.GrammarCorrect,
            CreatedAt = DateTime.UtcNow
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
