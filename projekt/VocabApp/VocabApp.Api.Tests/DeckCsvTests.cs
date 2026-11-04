using VocabApp.Api.Models;
using VocabApp.Api.Services;

namespace VocabApp.Api.Tests;

public class DeckCsvTests
{
    [Theory]
    [InlineData("Állatok és növények", "Állatok-és-növények.csv")]
    [InlineData("  Pakli 1 ", "Pakli-1.csv")]
    [InlineData("a/b\\c:d", "a-b-c-d.csv")]
    [InlineData("???", "pakli.csv")]
    [InlineData("", "pakli.csv")]
    public void ToFileName_BuildsSafeFileName(string deckName, string expected)
    {
        Assert.Equal(expected, DeckCsv.ToFileName(deckName));
    }

    [Fact]
    public void Write_EmptyDeck_ReturnsOnlyHeader()
    {
        Assert.Equal(DeckCsv.HeaderWithTags, DeckCsv.Write([]));
    }

    [Fact]
    public void WriteThenRead_RoundTripsAllFields()
    {
        var rows = new[]
        {
            new DeckCsvRow("dog", "a domestic animal", "The dog barks.", "kutya", "animal,pet"),
            new DeckCsvRow("cat", "a small animal", null, null, null)
        };

        Assert.True(DeckCsv.TryRead(DeckCsv.Write(rows), out var read, out var skipped, out var error));
        Assert.Null(error);
        Assert.Empty(skipped);
        Assert.Equal(2, read.Count);
        Assert.Equal(rows[0], read[0]);
        Assert.Equal("cat", read[1].Term);
        Assert.Null(read[1].Example);
    }

    [Fact]
    public void WriteThenRead_KeepsCommasQuotesAndNewlinesInsideFields()
    {
        var row = new DeckCsvRow("say \"hi\"", "line one,\nline two", "a, b", "szia, helló", null);

        Assert.True(DeckCsv.TryRead(DeckCsv.Write([row]), out var read, out var skipped, out _));
        Assert.Empty(skipped);
        Assert.Equal(row.Term, read[0].Term);
        Assert.Equal(row.Definition, read[0].Definition);
        Assert.Equal(row.Example, read[0].Example);
    }

    [Theory]
    [InlineData("=SUM(A1:A2)")]
    [InlineData("+36301234567")]
    [InlineData("@cmd")]
    [InlineData("-1+2")]
    public void Write_FormulaLikeText_IsNeutralizedAndRestoredOnRead(string text)
    {
        var csv = DeckCsv.Write([new DeckCsvRow(text, "def", null, null, null)]);

        Assert.Contains("\"'" + text + "\"", csv);
        Assert.True(DeckCsv.TryRead(csv, out var read, out _, out _));
        Assert.Equal(text, read[0].Term);
    }

    [Fact]
    public void Write_MinusFollowedByLetter_IsNotTreatedAsFormula()
    {
        var csv = DeckCsv.Write([new DeckCsvRow("-ing", "suffix", null, null, null)]);

        Assert.DoesNotContain("'-ing", csv);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("word,meaning")]
    [InlineData("term,definition")]
    public void TryRead_MissingOrWrongHeader_Fails(string? csv)
    {
        Assert.False(DeckCsv.TryRead(csv, out var rows, out _, out var error));
        Assert.Empty(rows);
        Assert.NotNull(error);
    }

    [Fact]
    public void TryRead_ThreeColumnHeader_Works()
    {
        var csv = "term,definition,example\ndog,a domestic animal,The dog barks.";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out _, out _));
        Assert.Equal(new DeckCsvRow("dog", "a domestic animal", "The dog barks.", null, null), rows.Single());
    }

    [Fact]
    public void TryRead_FourColumnHeader_ReadsTargetMeanings()
    {
        var csv = "term,definition,example,targetMeanings\ndog,def,,kutya";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out _, out _));
        Assert.Equal("kutya", rows.Single().TargetMeanings);
        Assert.Null(rows.Single().Example);
    }

    [Fact]
    public void TryRead_SemicolonDelimitedHeader_UsesSemicolons()
    {
        var csv = "term;definition;example;targetMeanings;tags\r\ndog;a domestic animal;;kutya;Animal";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Empty(skipped);
        Assert.Equal("animal", rows.Single().Tags);
    }

    [Fact]
    public void TryRead_Utf8Bom_IsIgnored()
    {
        var csv = "﻿term,definition,example\ndog,def,";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out _, out _));
        Assert.Single(rows);
    }

    [Fact]
    public void TryRead_WindowsLineEndingsAndBlankLines_AreHandled()
    {
        var csv = "term,definition,example\r\ndog,def,\r\n\r\ncat,def2,\r\n";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Empty(skipped);
        Assert.Equal(["dog", "cat"], rows.Select(row => row.Term));
    }

    [Fact]
    public void TryRead_HeaderOnly_ReturnsNoRows()
    {
        Assert.True(DeckCsv.TryRead("term,definition,example", out var rows, out var skipped, out _));
        Assert.Empty(rows);
        Assert.Empty(skipped);
    }

    [Fact]
    public void TryRead_BadRow_IsSkippedWithLineNumberAndOthersKept()
    {
        var csv = "term,definition,example\ndog,def,\ncat,only-two\nbird,def3,";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Equal(["dog", "bird"], rows.Select(row => row.Term));
        Assert.Contains("3. sor", Assert.Single(skipped));
    }

    [Fact]
    public void TryRead_MissingTermOrDefinition_IsSkipped()
    {
        var csv = "term,definition,example\n,def,\ndog,,";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Empty(rows);
        Assert.Equal(2, skipped.Count);
    }

    [Fact]
    public void TryRead_TooLongTerm_IsSkipped()
    {
        var csv = $"term,definition,example\n{new string('a', CardLimits.MaxTermLength + 1)},def,";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Empty(rows);
        Assert.Contains(CardLimits.MaxTermLength.ToString(), Assert.Single(skipped));
    }

    [Fact]
    public void TryRead_TermAtLimit_IsAccepted()
    {
        var csv = $"term,definition,example\n{new string('a', CardLimits.MaxTermLength)},def,";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Single(rows);
        Assert.Empty(skipped);
    }

    [Fact]
    public void TryRead_InvalidTags_RowIsSkipped()
    {
        var csv = "term,definition,example,targetMeanings,tags\ndog,def,,kutya,a;b;c;d;e;f";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Empty(rows);
        Assert.Single(skipped);
    }

    [Fact]
    public void TryRead_UnterminatedQuote_OnlyBreaksItsOwnRow()
    {
        var csv = "term,definition,example\ndog,\"broken,\ncat,def,\nbird,def,";

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out _));
        Assert.Equal(["cat", "bird"], rows.Select(row => row.Term));
        Assert.Single(skipped);
    }

    [Fact]
    public void TryRead_ManyBrokenQuoteLines_StillReadsTheFileAndReportsSkippedRows()
    {
        var lines = Enumerable.Range(0, 12).Select(i => $"w{i},\"broken,x");
        var csv = "term,definition,example\n" + string.Join('\n', lines);

        Assert.True(DeckCsv.TryRead(csv, out var rows, out var skipped, out var error));
        Assert.Null(error);
        Assert.Empty(rows);
        Assert.NotEmpty(skipped);
    }

    [Fact]
    public void TryRead_MoreThanMaxDataRows_Fails()
    {
        var lines = Enumerable.Range(0, DeckCsv.MaxDataRows + 1).Select(i => $"w{i},d,");
        var csv = "term,definition,example\n" + string.Join('\n', lines);

        Assert.False(DeckCsv.TryRead(csv, out _, out _, out var error));
        Assert.Contains(DeckCsv.MaxDataRows.ToString(), error);
    }

    [Fact]
    public void TryValidateRow_TrimsOptionalFieldsAndMapsBlanksToNull()
    {
        Assert.True(DeckCsv.TryValidateRow("dog", "def", "  ", "  kutya ", null, "sor", out var row, out var error));
        Assert.Null(error);
        Assert.Null(row.Example);
        Assert.Equal("kutya", row.TargetMeanings);
        Assert.Null(row.Tags);
    }

    [Fact]
    public void TryValidateRow_ErrorMessageStartsWithRowLabel()
    {
        Assert.False(DeckCsv.TryValidateRow("", "def", null, null, null, "3. kártya", out _, out var error));
        Assert.StartsWith("3. kártya:", error);
    }
}
