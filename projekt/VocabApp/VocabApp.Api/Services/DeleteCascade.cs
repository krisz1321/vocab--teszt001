using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;

namespace VocabApp.Api.Services;

/// <summary>
/// A SQL Server nem enged több kaszkádútvonalat ugyanahhoz a táblához, ezért néhány idegen kulcs NO ACTION
/// (lásd AppDbContext). Amit ezek nem takarítanak el maguktól, azt a törlés előtt, ugyanabban a tranzakcióban
/// kell megtenni, különben a törlés idegenkulcs-hibával elbukik.
/// </summary>
public static class DeleteCascade
{
    public static Task BeforeCardDeleteAsync(AppDbContext dbContext, int cardId, CancellationToken cancellationToken) =>
        dbContext.CardConfusions
            .Where(item => item.ConfusedWithCardId == cardId)
            .ExecuteDeleteAsync(cancellationToken);

    public static async Task BeforeDeckDeleteAsync(AppDbContext dbContext, int deckId, CancellationToken cancellationToken)
    {
        await dbContext.CardConfusions
            .Where(item => item.ConfusedWithCard.DeckId == deckId)
            .ExecuteDeleteAsync(cancellationToken);

        // A pakli törlése a megosztását is törli: a belőle mentett paklik megmaradnak, csak a forrásuk tűnik el.
        await dbContext.Decks
            .Where(deck => deck.SourceSharedDeck != null && deck.SourceSharedDeck.SourceDeckId == deckId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(deck => deck.SourceSharedDeckId, (int?)null), cancellationToken);
    }

    public static async Task BeforeUserDeleteAsync(AppDbContext dbContext, int userId, CancellationToken cancellationToken)
    {
        await dbContext.CardConfusions
            .Where(item => item.UserId == userId || item.ConfusedWithCard.Deck.UserId == userId)
            .ExecuteDeleteAsync(cancellationToken);
        await dbContext.Decks
            .Where(deck => deck.SourceSharedDeck != null && deck.SourceSharedDeck.OwnerId == userId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(deck => deck.SourceSharedDeckId, (int?)null), cancellationToken);

        await dbContext.FreeStudyMarks.Where(mark => mark.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await dbContext.SharedDeckSaves.Where(save => save.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await dbContext.SharedDecks.Where(share => share.OwnerId == userId).ExecuteDeleteAsync(cancellationToken);
        await dbContext.GrammarAttempts.Where(attempt => attempt.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await dbContext.CompositionAttempts.Where(attempt => attempt.UserId == userId).ExecuteDeleteAsync(cancellationToken);
    }
}
