using System.Diagnostics.CodeAnalysis;

namespace VocabApp.Api.Models;

// A Nyelvtan nézet igeidői. A kulcsok a kliens grammar.component.ts listájával egyeznek.
public static class GrammarTenses
{
    public const string Default = "present_simple,past_simple";

    public const int MaxKeyLength = 32;

    public const int MaxStoredLength = 300;

    // Kanonikus sorrend: kulcs és az MI-nek szóló angol leírás.
    private static readonly (string Key, string Description)[] Ordered =
    {
        ("present_simple", "present simple (e.g. she works)"),
        ("present_continuous", "present continuous (e.g. she is working)"),
        ("present_perfect", "present perfect (e.g. she has worked)"),
        ("present_perfect_continuous", "present perfect continuous (e.g. she has been working)"),
        ("past_simple", "past simple (e.g. she worked)"),
        ("past_continuous", "past continuous (e.g. she was working)"),
        ("past_perfect", "past perfect (e.g. she had worked)"),
        ("past_perfect_continuous", "past perfect continuous (e.g. she had been working)"),
        ("future_simple", "future simple with will (e.g. she will work)"),
        ("going_to", "be going to future (e.g. she is going to work)"),
        ("future_continuous", "future continuous (e.g. she will be working)"),
        ("future_perfect", "future perfect (e.g. she will have worked)"),
        ("future_perfect_continuous", "future perfect continuous (e.g. she will have been working)")
    };

    private static readonly Dictionary<string, string> Descriptions =
        Ordered.ToDictionary(item => item.Key, item => item.Description, StringComparer.Ordinal);

    public static bool IsAllowed([NotNullWhen(true)] string? value) =>
        value is not null && Descriptions.ContainsKey(value);

    public static string Describe(string key) => Descriptions[key];

    // A tárolt vesszős listából az ismert kulcsok kanonikus sorrendben; üres vagy hibás értéknél az alapérték.
    public static IReadOnlyList<string> Parse(string? stored)
    {
        var keys = Canonical((stored ?? string.Empty).Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));
        return keys.Count > 0 ? keys : Canonical(Default.Split(','));
    }

    // Duplikátummentes, kanonikus sorrendű lista; az ismeretlen kulcsok kimaradnak.
    public static IReadOnlyList<string> Canonical(IEnumerable<string> keys)
    {
        var requested = keys.ToHashSet(StringComparer.Ordinal);
        return Ordered.Select(item => item.Key).Where(requested.Contains).ToList();
    }
}
