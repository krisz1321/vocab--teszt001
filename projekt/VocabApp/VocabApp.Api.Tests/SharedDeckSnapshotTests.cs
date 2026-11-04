using VocabApp.Api.Models;
using VocabApp.Api.Services;

namespace VocabApp.Api.Tests;

public class SharedDeckSnapshotTests
{
    private static readonly SnapshotCard Dog = new("dog", "a domestic animal", "The dog barks.", "kutya", "animal");
    private static readonly SnapshotCard Cat = new("cat", "a small animal", null, "macska", null);

    private static string Hash(string name = "Állatok", string? description = null, string? level = null, params SnapshotCard[] cards) =>
        SharedDeckSnapshot.ComputeHash(name, description, level, cards);

    [Fact]
    public void ComputeHash_SameContent_SameHash()
    {
        Assert.Equal(Hash(cards: Dog), Hash(cards: Dog));
    }

    [Fact]
    public void ComputeHash_IsLowercaseSha256Hex()
    {
        var hash = Hash(cards: Dog);

        Assert.Equal(64, hash.Length);
        Assert.Matches("^[0-9a-f]+$", hash);
    }

    [Fact]
    public void ComputeHash_DifferentName_DifferentHash()
    {
        Assert.NotEqual(Hash("A", cards: Dog), Hash("B", cards: Dog));
    }

    [Fact]
    public void ComputeHash_DifferentDescriptionOrLevel_DifferentHash()
    {
        var baseHash = Hash(cards: Dog);

        Assert.NotEqual(baseHash, Hash(description: "leírás", cards: Dog));
        Assert.NotEqual(baseHash, Hash(level: "B1", cards: Dog));
    }

    [Theory]
    [InlineData("cat", "a domestic animal", "The dog barks.", "kutya", "animal")]
    [InlineData("dog", "an animal", "The dog barks.", "kutya", "animal")]
    [InlineData("dog", "a domestic animal", "A dog.", "kutya", "animal")]
    [InlineData("dog", "a domestic animal", "The dog barks.", "eb", "animal")]
    [InlineData("dog", "a domestic animal", "The dog barks.", "kutya", "pet")]
    public void ComputeHash_AnyCardFieldChange_ChangesHash(string term, string definition, string? example, string? meanings, string? tags)
    {
        var changed = new SnapshotCard(term, definition, example, meanings, tags);

        Assert.NotEqual(Hash(cards: Dog), Hash(cards: changed));
    }

    [Fact]
    public void ComputeHash_NullAndEmptyField_AreDifferent()
    {
        var withNull = new SnapshotCard("a", "b", null, null, null);
        var withEmpty = new SnapshotCard("a", "b", "", "", "");

        Assert.NotEqual(Hash(cards: withNull), Hash(cards: withEmpty));
    }

    [Fact]
    public void ComputeHash_FieldBoundaryShift_DoesNotCollide()
    {
        var first = new SnapshotCard("ab", "c", null, null, null);
        var second = new SnapshotCard("a", "bc", null, null, null);

        Assert.NotEqual(Hash(cards: first), Hash(cards: second));
    }

    [Fact]
    public void ComputeHash_CardOrderMatters()
    {
        Assert.NotEqual(Hash(cards: [Dog, Cat]), Hash(cards: [Cat, Dog]));
    }

    [Fact]
    public void ComputeHash_AddedCard_ChangesHash()
    {
        Assert.NotEqual(Hash(cards: Dog), Hash(cards: [Dog, Cat]));
    }

    [Fact]
    public void ToSnapshot_CopiesCardFields()
    {
        var card = new Card { Term = "dog", Definition = "def", Example = "ex", TargetMeanings = "kutya", Tags = "animal" };

        Assert.Equal(new SnapshotCard("dog", "def", "ex", "kutya", "animal"), SharedDeckSnapshot.ToSnapshot(card));
    }

    [Fact]
    public void ToSharedCard_RoundTrip_KeepsTheSameHash()
    {
        var card = new Card { Term = "dog", Definition = "def", Example = "ex", TargetMeanings = "kutya", Tags = "animal" };
        var shared = SharedDeckSnapshot.ToSharedCard(card);

        Assert.Equal(
            SharedDeckSnapshot.ComputeHash("n", null, null, [SharedDeckSnapshot.ToSnapshot(card)]),
            SharedDeckSnapshot.ComputeHash("n", null, null, [SharedDeckSnapshot.ToSnapshot(shared)]));
    }
}
