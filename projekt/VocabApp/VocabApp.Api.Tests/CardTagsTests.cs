using VocabApp.Api.Models;

namespace VocabApp.Api.Tests;

public class CardTagsTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData(" , ; ,")]
    public void TryNormalize_NoTags_ReturnsNull(string? input)
    {
        Assert.True(CardTags.TryNormalize(input, out var normalized, out var error));
        Assert.Null(normalized);
        Assert.Null(error);
    }

    [Fact]
    public void TryNormalize_LowercasesAndTrims()
    {
        Assert.True(CardTags.TryNormalize("  Állat ,  FOOD ", out var normalized, out _));
        Assert.Equal("állat,food", normalized);
    }

    [Fact]
    public void TryNormalize_AcceptsSemicolonSeparator()
    {
        Assert.True(CardTags.TryNormalize("a;b, c", out var normalized, out _));
        Assert.Equal("a,b,c", normalized);
    }

    [Fact]
    public void TryNormalize_CollapsesInnerWhitespace()
    {
        Assert.True(CardTags.TryNormalize("phrasal   verb", out var normalized, out _));
        Assert.Equal("phrasal verb", normalized);
    }

    [Fact]
    public void TryNormalize_RemovesDuplicatesIgnoringCase()
    {
        Assert.True(CardTags.TryNormalize("Food, food, FOOD, drink", out var normalized, out _));
        Assert.Equal("food,drink", normalized);
    }

    [Fact]
    public void TryNormalize_MaxCount_IsAccepted()
    {
        Assert.True(CardTags.TryNormalize("a,b,c,d,e", out var normalized, out _));
        Assert.Equal("a,b,c,d,e", normalized);
    }

    [Fact]
    public void TryNormalize_TooManyTags_ReturnsError()
    {
        Assert.False(CardTags.TryNormalize("a,b,c,d,e,f", out var normalized, out var error));
        Assert.Null(normalized);
        Assert.Contains(CardTags.MaxCount.ToString(), error);
    }

    [Fact]
    public void TryNormalize_DuplicatesDoNotCountTowardsLimit()
    {
        Assert.True(CardTags.TryNormalize("a,a,b,b,c,c,d,d,e,e", out var normalized, out _));
        Assert.Equal("a,b,c,d,e", normalized);
    }

    [Fact]
    public void TryNormalize_TagAtMaxLength_IsAccepted()
    {
        var tag = new string('x', CardTags.MaxTagLength);

        Assert.True(CardTags.TryNormalize(tag, out var normalized, out _));
        Assert.Equal(tag, normalized);
    }

    [Fact]
    public void TryNormalize_TagTooLong_ReturnsError()
    {
        var tag = new string('x', CardTags.MaxTagLength + 1);

        Assert.False(CardTags.TryNormalize(tag, out _, out var error));
        Assert.Contains(CardTags.MaxTagLength.ToString(), error);
    }

    [Fact]
    public void TryNormalize_FullSetOfLongestTags_FitsStoredLengthLimit()
    {
        var tags = string.Join(',', Enumerable.Range(0, CardTags.MaxCount)
            .Select(i => new string((char)('a' + i), CardTags.MaxTagLength)));

        Assert.True(CardTags.TryNormalize(tags, out var normalized, out _));
        Assert.True(normalized!.Length <= CardTags.MaxStoredLength);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("  Food ", "food")]
    [InlineData("Food, Drink", "food")]
    public void NormalizeFilter_ReturnsFirstNormalizedTag(string? input, string? expected)
    {
        Assert.Equal(expected, CardTags.NormalizeFilter(input));
    }

    [Fact]
    public void NormalizeFilter_InvalidTag_ReturnsNull()
    {
        Assert.Null(CardTags.NormalizeFilter(new string('x', CardTags.MaxTagLength + 1)));
    }
}
