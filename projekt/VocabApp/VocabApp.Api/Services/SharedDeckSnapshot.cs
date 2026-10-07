using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public readonly record struct SnapshotCard(
    string Term,
    string Definition,
    string? Example,
    string? TargetMeanings,
    string? Tags);

/// <summary>
/// A megosztott pakli tartalmának lenyomata. A saját pakli és a közzétett pillanatkép
/// lenyomatának összevetéséből derül ki, hogy a megosztás frissítésre szorul-e.
/// </summary>
public static class SharedDeckSnapshot
{
    public static string ComputeHash(
        string name,
        string? description,
        string? exampleLevel,
        IEnumerable<SnapshotCard> cards)
    {
        var builder = new StringBuilder();
        Append(builder, name);
        Append(builder, description);
        Append(builder, exampleLevel);
        foreach (var card in cards)
        {
            Append(builder, card.Term);
            Append(builder, card.Definition);
            Append(builder, card.Example);
            Append(builder, card.TargetMeanings);
            Append(builder, card.Tags);
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString()))).ToLowerInvariant();
    }

    public static SnapshotCard ToSnapshot(Card card) =>
        new(card.Term, card.Definition, card.Example, card.TargetMeanings, card.Tags);

    public static SnapshotCard ToSnapshot(SharedDeckCard card) =>
        new(card.Term, card.Definition, card.Example, card.TargetMeanings, card.Tags);

    public static SharedDeckCard ToSharedCard(Card card) => new()
    {
        Term = card.Term,
        Definition = card.Definition,
        Example = card.Example,
        TargetMeanings = card.TargetMeanings,
        Tags = card.Tags
    };

    /// <summary>
    /// A migrációval átvett megosztásoknak még nincs lenyomata: a már közzétett tartalomból számoljuk ki.
    /// </summary>
    public static async Task BackfillHashesAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
    {
        var pending = await dbContext.SharedDecks
            .Include(share => share.Cards)
            .Where(share => share.ContentHash == "")
            .ToListAsync(cancellationToken);
        if (pending.Count == 0)
        {
            return;
        }

        foreach (var share in pending)
        {
            share.ContentHash = ComputeHash(
                share.Name,
                share.Description,
                share.ExampleLevel,
                share.Cards.OrderBy(card => card.Id).Select(card => ToSnapshot(card)));
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static void Append(StringBuilder builder, string? value)
    {
        // A hosszelőtag miatt két különböző mezőkiosztás sosem ad ugyanolyan szöveget.
        builder.Append(value is null ? -1 : value.Length).Append(':').Append(value).Append('|');
    }
}
