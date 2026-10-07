using System.Text.RegularExpressions;

namespace VocabApp.Api.Models;

public static partial class Usernames
{
    public const int MinLength = 3;
    public const int MaxLength = 30;

    [GeneratedRegex("^[A-Za-z0-9_.-]+$")]
    private static partial Regex AllowedCharacters();

    /// <summary>Hibaüzenet, ha a felhasználónév érvénytelen, különben null.</summary>
    public static string? Validate(string? username)
    {
        if (string.IsNullOrEmpty(username))
        {
            return "A felhasználónév megadása kötelező.";
        }

        if (username.Length < MinLength || username.Length > MaxLength)
        {
            return $"A felhasználónév {MinLength}–{MaxLength} karakter hosszú lehet.";
        }

        if (!AllowedCharacters().IsMatch(username))
        {
            return "A felhasználónév csak angol betűt, számot, pontot, kötőjelet és aláhúzást tartalmazhat.";
        }

        return null;
    }
}
