using VocabApp.Api.Services;

namespace VocabApp.Api.Tests;

public class StudyClockTests
{
    [Fact]
    public void LocalDate_BudapestWinter_AddsOneHour()
    {
        var utc = new DateTime(2026, 1, 15, 23, 30, 0, DateTimeKind.Utc);

        Assert.Equal(new DateTime(2026, 1, 16), StudyClock.LocalDate("Europe/Budapest", utc));
    }

    [Fact]
    public void LocalDate_BudapestSummer_AddsTwoHours()
    {
        var utc = new DateTime(2026, 7, 15, 22, 30, 0, DateTimeKind.Utc);

        Assert.Equal(new DateTime(2026, 7, 16), StudyClock.LocalDate("Europe/Budapest", utc));
    }

    [Fact]
    public void LocalDateFromStoredUtc_UnspecifiedKind_IsTreatedAsUtc()
    {
        var stored = new DateTime(2026, 1, 15, 23, 30, 0, DateTimeKind.Unspecified);

        Assert.Equal(new DateTime(2026, 1, 16), StudyClock.LocalDateFromStoredUtc("Europe/Budapest", stored));
    }

    [Fact]
    public void LocalDate_NullZone_UsesDefaultZone()
    {
        var utc = new DateTime(2026, 1, 15, 23, 30, 0, DateTimeKind.Utc);

        Assert.Equal(StudyClock.LocalDate(StudyClock.DefaultTimeZoneId, utc), StudyClock.LocalDate(null, utc));
    }

    [Fact]
    public void UtcStartOfLocalDate_Winter_IsPreviousEveningUtc()
    {
        var start = StudyClock.UtcStartOfLocalDate("Europe/Budapest", new DateTime(2026, 1, 16, 13, 45, 0));

        Assert.Equal(new DateTime(2026, 1, 15, 23, 0, 0), start);
        Assert.Equal(DateTimeKind.Utc, start.Kind);
    }

    [Fact]
    public void UtcStartOfLocalDate_Summer_IsTwoHoursEarlier()
    {
        var start = StudyClock.UtcStartOfLocalDate("Europe/Budapest", new DateTime(2026, 7, 16));

        Assert.Equal(new DateTime(2026, 7, 15, 22, 0, 0), start);
    }

    [Fact]
    public void UtcStartOfLocalDate_MidnightGap_DoesNotThrow()
    {
        // Chilében a nyári időszámítás éjfélkor kezdődik, ilyenkor a helyi éjfél nem létezik.
        var start = StudyClock.UtcStartOfLocalDate("America/Santiago", new DateTime(2026, 9, 6));

        Assert.Equal(DateTimeKind.Utc, start.Kind);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Nincs/Ilyen_Zona")]
    public void NormalizeTimeZoneId_MissingOrUnknown_FallsBackToDefault(string? id)
    {
        Assert.Equal(StudyClock.DefaultTimeZoneId, StudyClock.NormalizeTimeZoneId(id));
    }

    [Fact]
    public void NormalizeTimeZoneId_KnownZone_IsKeptAndTrimmed()
    {
        Assert.Equal("Europe/London", StudyClock.NormalizeTimeZoneId("  Europe/London "));
    }
}
