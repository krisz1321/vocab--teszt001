using VocabApp.Api.Models;

namespace VocabApp.Api.Tests;

public class CardLeechTests
{
    [Theory]
    [InlineData(6, 0, 6, true)]
    [InlineData(6, 5, 6, true)]
    [InlineData(6, 6, 6, false)]
    [InlineData(5, 0, 6, false)]
    [InlineData(2, 1, 2, true)]
    [InlineData(0, 0, 2, false)]
    public void IsLeech_NeedsThresholdAndMoreMistakesThanCorrectAnswers(int incorrect, int correct, int threshold, bool expected)
    {
        Assert.Equal(expected, CardLeech.IsLeech(incorrect, correct, threshold));
    }

    [Fact]
    public void Thresholds_AreConsistent()
    {
        Assert.InRange(CardLeech.DefaultThreshold, CardLeech.MinThreshold, CardLeech.MaxThreshold);
    }
}

public class CardSuspensionsTests
{
    private static readonly DateTime Now = new(2026, 11, 4, 12, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData("none")]
    [InlineData("suspended")]
    [InlineData("buried")]
    public void IsAllowed_KnownModes(string mode) => Assert.True(CardSuspensions.IsAllowed(mode));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("None")]
    [InlineData("paused")]
    public void IsAllowed_UnknownModes(string? mode) => Assert.False(CardSuspensions.IsAllowed(mode));

    [Fact]
    public void StateOf_NoDate_IsNone() => Assert.Equal("none", CardSuspensions.StateOf(null, Now));

    [Fact]
    public void StateOf_PastDate_IsNone() => Assert.Equal("none", CardSuspensions.StateOf(Now.AddMinutes(-1), Now));

    [Fact]
    public void StateOf_ExactlyNow_IsNone() => Assert.Equal("none", CardSuspensions.StateOf(Now, Now));

    [Fact]
    public void StateOf_FutureDate_IsBuried() => Assert.Equal("buried", CardSuspensions.StateOf(Now.AddHours(5), Now));

    [Fact]
    public void StateOf_MaxValue_IsSuspended() => Assert.Equal("suspended", CardSuspensions.StateOf(DateTime.MaxValue, Now));
}

public class ExampleLevelsTests
{
    [Theory]
    [InlineData("A1", 0)]
    [InlineData("A2", 1)]
    [InlineData("B1", 2)]
    [InlineData("B2", 3)]
    [InlineData("C1", 4)]
    [InlineData("C2", 5)]
    public void Rank_FollowsCefrOrder(string level, int rank)
    {
        Assert.True(ExampleLevels.IsAllowed(level));
        Assert.Equal(rank, ExampleLevels.Rank(level));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("b1")]
    [InlineData("D1")]
    [InlineData("B1 ")]
    public void IsAllowed_RejectsOtherValues(string? level)
    {
        Assert.False(ExampleLevels.IsAllowed(level));
        Assert.Equal(-1, ExampleLevels.Rank(level));
    }

    [Fact]
    public void Default_IsAllowed() => Assert.True(ExampleLevels.IsAllowed(ExampleLevels.Default));
}

public class SavedLevelPoliciesTests
{
    [Theory]
    [InlineData("exact")]
    [InlineData("all")]
    [InlineData("noHarder")]
    [InlineData("noEasier")]
    public void IsAllowed_KnownPolicies(string policy) => Assert.True(SavedLevelPolicies.IsAllowed(policy));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Exact")]
    [InlineData("harder")]
    public void IsAllowed_UnknownPolicies(string? policy) => Assert.False(SavedLevelPolicies.IsAllowed(policy));

    [Theory]
    [InlineData("exact", "B1", "B1", true)]
    [InlineData("exact", "B1", "B2", false)]
    [InlineData("exact", "B1", "A2", false)]
    [InlineData("all", "B1", "C2", true)]
    [InlineData("all", "B1", "A1", true)]
    [InlineData("noHarder", "B1", "A1", true)]
    [InlineData("noHarder", "B1", "B1", true)]
    [InlineData("noHarder", "B1", "B2", false)]
    [InlineData("noEasier", "B1", "C1", true)]
    [InlineData("noEasier", "B1", "B1", true)]
    [InlineData("noEasier", "B1", "A2", false)]
    public void Matches_AppliesPolicy(string policy, string current, string stored, bool expected)
    {
        Assert.Equal(expected, SavedLevelPolicies.Matches(policy, current, stored));
    }

    [Fact]
    public void Matches_UnknownLevels_FallBackToExactComparison()
    {
        Assert.True(SavedLevelPolicies.Matches("noHarder", "X9", "X9"));
        Assert.False(SavedLevelPolicies.Matches("noHarder", "X9", "A1"));
    }

    [Fact]
    public void Matches_UnknownPolicy_BehavesLikeExact()
    {
        Assert.True(SavedLevelPolicies.Matches("whatever", "B2", "B2"));
        Assert.False(SavedLevelPolicies.Matches("whatever", "B2", "B1"));
    }
}

public class GrammarTensesTests
{
    [Fact]
    public void Canonical_ReturnsKnownKeysInCanonicalOrderWithoutDuplicates()
    {
        var result = GrammarTenses.Canonical(["past_simple", "present_simple", "past_simple", "bogus"]);

        Assert.Equal(["present_simple", "past_simple"], result);
    }

    [Fact]
    public void Parse_NullOrEmpty_ReturnsDefault()
    {
        Assert.Equal(["present_simple", "past_simple"], GrammarTenses.Parse(null));
        Assert.Equal(["present_simple", "past_simple"], GrammarTenses.Parse(""));
        Assert.Equal(["present_simple", "past_simple"], GrammarTenses.Parse("nonsense,other"));
    }

    [Fact]
    public void Parse_StoredList_IsReorderedCanonically()
    {
        Assert.Equal(["present_perfect", "future_simple"], GrammarTenses.Parse(" future_simple , present_perfect "));
    }

    [Fact]
    public void ThirteenTenses_AreAllAllowedAndDescribed()
    {
        var all = GrammarTenses.Canonical(
        [
            "present_simple", "present_continuous", "present_perfect", "present_perfect_continuous",
            "past_simple", "past_continuous", "past_perfect", "past_perfect_continuous",
            "future_simple", "going_to", "future_continuous", "future_perfect", "future_perfect_continuous"
        ]);

        Assert.Equal(13, all.Count);
        Assert.All(all, key =>
        {
            Assert.True(GrammarTenses.IsAllowed(key));
            Assert.False(string.IsNullOrWhiteSpace(GrammarTenses.Describe(key)));
            Assert.InRange(key.Length, 1, GrammarTenses.MaxKeyLength);
        });
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Present_Simple")]
    [InlineData("future")]
    public void IsAllowed_RejectsUnknownKeys(string? key) => Assert.False(GrammarTenses.IsAllowed(key));

    [Fact]
    public void Default_FitsStoredLengthAndIsValid()
    {
        Assert.True(GrammarTenses.Default.Length <= GrammarTenses.MaxStoredLength);
        Assert.All(GrammarTenses.Default.Split(','), key => Assert.True(GrammarTenses.IsAllowed(key)));
    }
}

public class AiModelsTests
{
    [Fact]
    public void Default_IsOneOfTheListedModels() => Assert.Contains(AiModels.All, model => model.Id == AiModels.Default);

    [Fact]
    public void All_HasUniqueIdsAndLabels()
    {
        Assert.Equal(AiModels.All.Count, AiModels.All.Select(model => model.Id).Distinct().Count());
        Assert.All(AiModels.All, model => Assert.False(string.IsNullOrWhiteSpace(model.Label)));
    }

    [Fact]
    public void All_IdsFitTheSettingsLimit()
    {
        Assert.All(AiModels.All, model => Assert.True(model.Id.Length <= 64));
    }

    [Fact]
    public void IsAllowed_AcceptsListedAndRejectsOthers()
    {
        Assert.All(AiModels.All, model => Assert.True(AiModels.IsAllowed(model.Id)));
        Assert.False(AiModels.IsAllowed("made-up/model"));
        Assert.False(AiModels.IsAllowed(null));
        Assert.False(AiModels.IsAllowed(""));
    }
}

public class DeckLimitsTests
{
    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("   ", null)]
    [InlineData("  leírás ", "leírás")]
    public void NormalizeDescription_TrimsAndMapsBlankToNull(string? input, string? expected)
    {
        Assert.Equal(expected, DeckLimits.NormalizeDescription(input));
    }
}

public class LimitConstantsTests
{
    [Fact]
    public void CardLimits_MatchTheDocumentedValues()
    {
        Assert.Equal(100, CardLimits.MaxTermLength);
        Assert.Equal(500, CardLimits.MaxDefinitionLength);
        Assert.Equal(500, CardLimits.MaxExampleLength);
        Assert.Equal(300, CardLimits.MaxTargetMeaningsLength);
    }

    [Fact]
    public void AvatarLimits_RequestLimitIncludesMultipartOverhead()
    {
        Assert.Equal(1024 * 1024, AvatarLimits.MaxBytes);
        Assert.Equal(AvatarLimits.MaxBytes + AvatarLimits.MultipartOverheadBytes, AvatarLimits.MaxRequestBytes);
    }

    [Fact]
    public void CompositionLimits_AllowTwoToFiveWords()
    {
        Assert.Equal(2, CompositionLimits.MinWords);
        Assert.Equal(5, CompositionLimits.MaxWords);
    }

    [Fact]
    public void AiFillLimits_DefaultBatchSizeIsInRange()
    {
        Assert.InRange(AiFillLimits.DefaultBatchSize, AiFillLimits.MinBatchSize, AiFillLimits.MaxBatchSize);
    }

    [Fact]
    public void StoredTagLength_CanHoldFiveMaximumTags()
    {
        // 5 × 24 karakter + 4 vessző
        Assert.True(CardTags.MaxCount * CardTags.MaxTagLength + CardTags.MaxCount - 1 <= CardTags.MaxStoredLength);
    }
}
