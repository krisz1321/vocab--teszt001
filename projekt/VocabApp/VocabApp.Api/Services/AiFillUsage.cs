using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Data;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public readonly record struct AiFillStatus(int Used, int DailyLimit)
{
    // A hátralévő érték negatív is lehet: a napi keret egyelőre csak számolva van, nincs érvényesítve.
    public int Remaining => DailyLimit - Used;
}

/// <summary>Az import közbeni AI-kitöltés napi keretének számlálója (felhasználónként, a saját időzóna szerinti napra).</summary>
public sealed class AiFillUsage(AppDbContext dbContext, IConfiguration configuration)
{
    public const int DefaultDailyLimit = 100;

    public int DailyLimit => Math.Max(0, configuration.GetValue("AiFill:DailyLimit", DefaultDailyLimit));

    // Ha true, a keret túllépése tiltja a kitöltést. Alapból ki van kapcsolva.
    public bool EnforceDailyLimit => configuration.GetValue("AiFill:EnforceDailyLimit", false);

    public async Task<AiFillStatus> GetStatusAsync(int userId, CancellationToken cancellationToken = default)
    {
        var day = await LocalDayAsync(userId, cancellationToken);
        var used = await dbContext.UserAiFillDays
            .AsNoTracking()
            .Where(item => item.UserId == userId && item.Day == day)
            .Select(item => item.Count)
            .SingleOrDefaultAsync(cancellationToken);

        return new AiFillStatus(used, DailyLimit);
    }

    public async Task<AiFillStatus> AddAsync(int userId, int count, CancellationToken cancellationToken = default)
    {
        if (count <= 0)
        {
            return await GetStatusAsync(userId, cancellationToken);
        }

        var day = await LocalDayAsync(userId, cancellationToken);
        var updated = await dbContext.UserAiFillDays
            .Where(item => item.UserId == userId && item.Day == day)
            .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.Count, item => item.Count + count), cancellationToken);

        if (updated == 0)
        {
            dbContext.UserAiFillDays.Add(new UserAiFillDay { UserId = userId, Day = day, Count = count });
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // Párhuzamos kérés közben létrejött a sor: leválasztjuk a sajátunkat és növeljük a meglévőt.
                foreach (var entry in dbContext.ChangeTracker.Entries<UserAiFillDay>().ToList())
                {
                    if (entry.State == EntityState.Added)
                    {
                        entry.State = EntityState.Detached;
                    }
                }

                await dbContext.UserAiFillDays
                    .Where(item => item.UserId == userId && item.Day == day)
                    .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.Count, item => item.Count + count), cancellationToken);
            }
        }

        return await GetStatusAsync(userId, cancellationToken);
    }

    private async Task<DateTime> LocalDayAsync(int userId, CancellationToken cancellationToken)
    {
        var timeZoneId = await dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => user.TimeZoneId)
            .SingleOrDefaultAsync(cancellationToken);

        return StudyClock.LocalDate(timeZoneId, DateTime.UtcNow);
    }
}
