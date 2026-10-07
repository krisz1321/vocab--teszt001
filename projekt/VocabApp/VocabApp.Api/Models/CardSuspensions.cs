using System.Diagnostics.CodeAnalysis;

namespace VocabApp.Api.Models;

public static class CardSuspensions
{
    public const string None = "none";
    public const string Suspended = "suspended";
    public const string Buried = "buried";

    public static bool IsAllowed([NotNullWhen(true)] string? value) =>
        value is None or Suspended or Buried;

    public static string StateOf(DateTime? suspendedUntil, DateTime now)
    {
        if (suspendedUntil is null || suspendedUntil <= now)
        {
            return None;
        }

        return suspendedUntil == DateTime.MaxValue ? Suspended : Buried;
    }
}
