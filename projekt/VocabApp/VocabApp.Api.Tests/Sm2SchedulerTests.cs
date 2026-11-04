using VocabApp.Api.Services;

namespace VocabApp.Api.Tests;

public class Sm2SchedulerTests
{
    [Fact]
    public void NextEaseFactor_CorrectAnswer_KeepsFactor()
    {
        Assert.Equal(2.5f, Sm2Scheduler.NextEaseFactor(2.5f, true));
    }

    [Fact]
    public void NextEaseFactor_IncorrectAnswer_DecreasesFactor()
    {
        Assert.Equal(2.18f, Sm2Scheduler.NextEaseFactor(2.5f, false), 2);
    }

    [Fact]
    public void NextEaseFactor_RepeatedMistakes_NeverDropsBelowMinimum()
    {
        var factor = 2.5f;
        for (var i = 0; i < 50; i++)
        {
            factor = Sm2Scheduler.NextEaseFactor(factor, false);
        }

        Assert.Equal(1.3f, factor);
    }

    [Fact]
    public void NextEaseFactor_CorrectAnswerAtMinimum_StaysAtMinimum()
    {
        Assert.Equal(1.3f, Sm2Scheduler.NextEaseFactor(1.3f, true), 2);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void NextInterval_FirstCorrectAnswer_IsOneDay(int streak)
    {
        Assert.Equal(1, Sm2Scheduler.NextInterval(streak, 0, 2.5f));
    }

    [Fact]
    public void NextInterval_SecondCorrectAnswer_IsSixDays()
    {
        Assert.Equal(6, Sm2Scheduler.NextInterval(2, 1, 2.5f));
    }

    [Theory]
    [InlineData(3, 6, 2.5f, 15)]
    [InlineData(4, 15, 2.5f, 38)]
    [InlineData(3, 10, 1.3f, 13)]
    public void NextInterval_LaterAnswers_MultipliesByEaseFactor(int streak, int previous, float ease, int expected)
    {
        Assert.Equal(expected, Sm2Scheduler.NextInterval(streak, previous, ease));
    }

    [Fact]
    public void NextInterval_ZeroPreviousInterval_FallsBackToOneDay()
    {
        Assert.Equal(1, Sm2Scheduler.NextInterval(5, 0, 2.5f));
    }

    [Fact]
    public void NextInterval_VeryLargeInterval_IsCappedAtIntMax()
    {
        Assert.Equal(int.MaxValue, Sm2Scheduler.NextInterval(10, int.MaxValue, 2.5f));
    }
}
