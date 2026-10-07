using System.Diagnostics.CodeAnalysis;

namespace VocabApp.Api.Models;

public static class CardTags
{
    public const int MaxCount = 5;
    public const int MaxTagLength = 24;
    public const int MaxStoredLength = 200;

    // Szűréshez egyetlen címke kell: a normalizált első címke, vagy null, ha nincs érvényes.
    public static string? NormalizeFilter(string? tag) =>
        TryNormalize(tag, out var normalized, out _) && normalized is not null
            ? normalized.Split(',')[0]
            : null;

    // A címkék vesszővel (vagy pontosvesszővel) elválasztva érkeznek. Tárolva kisbetűs,
    // ismétlődés nélküli, vesszővel elválasztott lista, vagy null, ha nincs címke.
    public static bool TryNormalize(string? input, out string? normalized, [NotNullWhen(false)] out string? error)
    {
        normalized = null;
        error = null;

        var tags = new List<string>();
        foreach (var part in (input ?? string.Empty).Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var tag = string.Join(' ', part.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
                .ToLowerInvariant();
            if (tag.Length == 0 || tags.Contains(tag))
            {
                continue;
            }

            if (tag.Length > MaxTagLength)
            {
                error = $"Egy címke legfeljebb {MaxTagLength} karakter lehet.";
                return false;
            }

            tags.Add(tag);
        }

        if (tags.Count > MaxCount)
        {
            error = $"Legfeljebb {MaxCount} címke adható meg.";
            return false;
        }

        normalized = tags.Count == 0 ? null : string.Join(',', tags);
        return true;
    }
}
