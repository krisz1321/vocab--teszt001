namespace VocabApp.Api.Services;

public static class Sm2Scheduler
{
    private const int CorrectQuality = 4;
    private const int IncorrectQuality = 2;
    private const float MinimumEaseFactor = 1.3f;

    public static float NextEaseFactor(float easeFactor, bool isCorrect)
    {
        var quality = isCorrect ? CorrectQuality : IncorrectQuality;
        var lapse = 5 - quality;
        var updated = (decimal)easeFactor + (0.1m - lapse * (0.08m + lapse * 0.02m));
        if (updated < 1.3m)
        {
            return MinimumEaseFactor;
        }

        return (float)updated;
    }

    public static int NextInterval(int streak, int previousInterval, float easeFactor)
    {
        if (streak <= 1)
        {
            return 1;
        }

        if (streak == 2)
        {
            return 6;
        }

        var days = Math.Round(previousInterval * (double)easeFactor, MidpointRounding.AwayFromZero);
        if (double.IsNaN(days) || days < 1d)
        {
            return 1;
        }

        if (days > int.MaxValue)
        {
            return int.MaxValue;
        }

        return (int)days;
    }
}
