using VocabApp.Api.Models;

namespace VocabApp.Api.Tests;

public class UsernamesTests
{
    [Theory]
    [InlineData("abc")]
    [InlineData("Demo_User-1.x")]
    [InlineData("a1b2c3")]
    public void Validate_ValidName_ReturnsNull(string username)
    {
        Assert.Null(Usernames.Validate(username));
    }

    [Fact]
    public void Validate_MaxLength_IsValid()
    {
        Assert.Null(Usernames.Validate(new string('a', Usernames.MaxLength)));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Validate_Empty_ReturnsRequiredMessage(string? username)
    {
        Assert.Equal("A felhasználónév megadása kötelező.", Usernames.Validate(username));
    }

    [Fact]
    public void Validate_TooShort_ReturnsLengthMessage()
    {
        Assert.Contains("3–30", Usernames.Validate("ab"));
    }

    [Fact]
    public void Validate_TooLong_ReturnsLengthMessage()
    {
        Assert.Contains("3–30", Usernames.Validate(new string('a', Usernames.MaxLength + 1)));
    }

    [Theory]
    [InlineData("kiss pista")]
    [InlineData("péter")]
    [InlineData("user@mail")]
    [InlineData("a/b/c")]
    [InlineData(" abc")]
    public void Validate_DisallowedCharacters_ReturnsCharacterMessage(string username)
    {
        Assert.Contains("csak angol betűt", Usernames.Validate(username));
    }
}
