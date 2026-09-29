using System.Diagnostics.CodeAnalysis;

namespace VocabApp.Api.Models;

public static class ExampleLevels
{
    public const string Default = "B1";

    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "A1",
        "A2",
        "B1",
        "B2",
        "C1",
        "C2"
    };

    public static bool IsAllowed([NotNullWhen(true)] string? value) =>
        value is not null && Allowed.Contains(value);

    public static int Rank(string? level) => level switch
    {
        "A1" => 0,
        "A2" => 1,
        "B1" => 2,
        "B2" => 3,
        "C1" => 4,
        "C2" => 5,
        _ => -1
    };
}
