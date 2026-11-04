using System.Diagnostics.CodeAnalysis;

namespace VocabApp.Api.Models;

public sealed record AiModelOption(string Id, string Label);

public static class AiModels
{
    public const string Default = "google/gemini-3.6-flash";

    // A választható modellek a felületen megjelenő sorrendben; a kliens a GET api/ai/models végpontról kéri le.
    public static readonly IReadOnlyList<AiModelOption> All =
    [
        new("google/gemini-3.6-flash", "Gemini 3.6 Flash"),
        new("google/gemini-3.7-flash", "Gemini 3.7 Flash"),
        new("google/gemini-3.8-flash", "Gemini 3.8 Flash"),
        new("openai/gpt-5-mini", "GPT-5 Mini")
    ];

    private static readonly HashSet<string> Allowed = new(All.Select(model => model.Id), StringComparer.Ordinal);

    public static bool IsAllowed([NotNullWhen(true)] string? value) =>
        value is not null && Allowed.Contains(value);
}
