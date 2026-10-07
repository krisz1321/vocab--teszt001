namespace VocabApp.Api.Models;

public static class CardLeech
{
    public const int DefaultThreshold = 6;
    public const int MinThreshold = 2;
    public const int MaxThreshold = 50;

    // Nehéz szó: legalább a küszöbnyi hiba, és több a hibás, mint a helyes válasz.
    public static bool IsLeech(int incorrectCount, int correctCount, int threshold) =>
        incorrectCount >= threshold && incorrectCount > correctCount;
}
