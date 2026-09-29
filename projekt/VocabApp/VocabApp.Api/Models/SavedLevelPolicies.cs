using System.Diagnostics.CodeAnalysis;

namespace VocabApp.Api.Models;

public static class SavedLevelPolicies
{
    public const string Exact = "exact";
    public const string All = "all";
    public const string NoHarder = "noHarder";
    public const string NoEasier = "noEasier";

    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        Exact,
        All,
        NoHarder,
        NoEasier
    };

    public static bool IsAllowed([NotNullWhen(true)] string? value) =>
        value is not null && Allowed.Contains(value);

    public static bool Matches(string? policy, string currentLevel, string storedLevel)
    {
        if (string.Equals(policy, All, StringComparison.Ordinal))
        {
            return true;
        }

        var currentRank = ExampleLevels.Rank(currentLevel);
        var storedRank = ExampleLevels.Rank(storedLevel);
        if (currentRank < 0 || storedRank < 0)
        {
            return string.Equals(storedLevel, currentLevel, StringComparison.Ordinal);
        }

        if (string.Equals(policy, NoHarder, StringComparison.Ordinal))
        {
            return storedRank <= currentRank;
        }

        if (string.Equals(policy, NoEasier, StringComparison.Ordinal))
        {
            return storedRank >= currentRank;
        }

        return storedRank == currentRank;
    }
}
