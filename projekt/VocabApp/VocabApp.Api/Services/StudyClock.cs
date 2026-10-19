namespace VocabApp.Api.Services;

public static class StudyClock
{
    public const string DefaultTimeZoneId = "Europe/Budapest";

    public static DateTime LocalDate(string? timeZoneId, DateTime utcNow)
    {
        var utc = DateTime.SpecifyKind(utcNow, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeFromUtc(utc, Resolve(timeZoneId)).Date;
    }

    public static DateTime LocalDateFromStoredUtc(string? timeZoneId, DateTime storedUtc)
    {
        return LocalDate(timeZoneId, DateTime.SpecifyKind(storedUtc, DateTimeKind.Utc));
    }

    public static DateTime UtcStartOfLocalDate(string? timeZoneId, DateTime localDate)
    {
        var zone = Resolve(timeZoneId);
        var local = DateTime.SpecifyKind(localDate.Date, DateTimeKind.Unspecified);
        // Ahol a nyári időszámítás éjfélkor kezdődik (pl. America/Santiago), a helyi éjfél nem létezik, és a
        // ConvertTimeToUtc kivételt dobna; ilyenkor a nap a rés utáni első létező percben kezdődik.
        var guard = 0;
        while (zone.IsInvalidTime(local) && guard++ < 24 * 60)
        {
            local = local.AddMinutes(1);
        }

        return TimeZoneInfo.ConvertTimeToUtc(local, zone);
    }

    public static string NormalizeTimeZoneId(string? timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId))
        {
            return DefaultTimeZoneId;
        }

        var trimmed = timeZoneId.Trim();
        try
        {
            if (TimeZoneInfo.TryConvertIanaIdToWindowsId(trimmed, out var windowsId))
            {
                return trimmed;
            }

            TimeZoneInfo.FindSystemTimeZoneById(trimmed);
            return trimmed;
        }
        catch (TimeZoneNotFoundException)
        {
            return DefaultTimeZoneId;
        }
        catch (InvalidTimeZoneException)
        {
            return DefaultTimeZoneId;
        }
    }

    private static TimeZoneInfo Resolve(string? timeZoneId)
    {
        var normalized = NormalizeTimeZoneId(timeZoneId);
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(normalized);
        }
        catch (TimeZoneNotFoundException)
        {
            if (TimeZoneInfo.TryConvertIanaIdToWindowsId(normalized, out var windowsId))
            {
                return TimeZoneInfo.FindSystemTimeZoneById(windowsId);
            }

            return TimeZoneInfo.Utc;
        }
        catch (InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }
}
