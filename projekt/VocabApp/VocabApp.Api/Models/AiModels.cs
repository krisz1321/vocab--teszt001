using System.Diagnostics.CodeAnalysis;

namespace VocabApp.Api.Models;

public static class AiModels
{
    public const string Default = "google/gemini-3.6-flash";

    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        "google/gemini-3.6-flash",
        "google/gemini-3.7-flash",
        "google/gemini-3.8-flash",
        "openai/gpt-5-mini"
    };

    public static bool IsAllowed([NotNullWhen(true)] string? value) =>
        value is not null && Allowed.Contains(value);
}
