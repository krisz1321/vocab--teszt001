using System.Net;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

[Collection(ApiCollection.Name)]
public class SmokeTests(ApiFactory factory)
{
    [Fact]
    public async Task RegisteredUser_CanReadOwnDecks()
    {
        var user = await factory.RegisterUserAsync();

        var decks = await user.GetAsync<List<VocabApp.Api.DTOs.DeckDto>>("/api/decks");

        Assert.Equal("Saját pakli", Assert.Single(decks).Name);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithoutToken_Returns401()
    {
        var response = await factory.CreateAnonymousClient().GetAsync("/api/decks");

        await response.AssertStatusAsync(HttpStatusCode.Unauthorized);
    }
}
