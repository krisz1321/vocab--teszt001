using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

// A Mondatok nézet eredményei. Az SM-2-höz (CardProgress) nem nyúl.
public sealed class CompositionService(AppDbContext dbContext) : ICompositionService
{
    public async Task<int> RecordAttemptAsync(
        int userId,
        CompositionCheckResponseDto result,
        CancellationToken cancellationToken = default)
    {
        var attempt = new CompositionAttempt
        {
            UserId = userId,
            IsCorrect = result.IsCorrect,
            GrammarCorrect = result.GrammarCorrect,
            Coherent = result.Coherent,
            CreatedAt = DateTime.UtcNow,
            Words = result.Words
                .Select(word => new CompositionAttemptWord { CardId = word.CardId, UsedCorrectly = word.UsedCorrectly })
                .ToList()
        };
        dbContext.CompositionAttempts.Add(attempt);
        await dbContext.SaveChangesAsync(cancellationToken);
        return attempt.Id;
    }

    // "Márpedig jó volt": a saját, MI szerint hibás eredmény kézzel helyesre vált. Idegen vagy nem létező → false (404).
    public async Task<bool> AcceptAttemptAsync(int userId, int attemptId, CancellationToken cancellationToken = default)
    {
        var attempt = await dbContext.CompositionAttempts
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
