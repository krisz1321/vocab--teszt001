using System.Net;
using System.Net.Http.Json;
using VocabApp.Api.DTOs;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

/// <summary>A sebességkorlátozás: alapból ki van kapcsolva, bekapcsolva a három szabály (auth, availability, ai) él.</summary>
public class RateLimitingTests
{
    private const string TooManyRequests = "Túl sok kérés érkezett. Kérlek, várj egy kicsit, majd próbáld újra.";

    [Collection(ApiCollection.Name)]
    public class WhenDisabled(ApiFactory factory)
    {
        [Fact]
        public async Task ManyRapidLoginsAreNeverThrottled()
        {
            var client = factory.CreateAnonymousClient();

            var statuses = new List<HttpStatusCode>();
            for (var i = 0; i < 30; i++)
            {
                statuses.Add((await client.PostAsJsonAsync("/api/auth/login", new LoginDto { Email = "nobody@test.local", Password = "x" })).StatusCode);
            }

            Assert.All(statuses, status => Assert.Equal(HttpStatusCode.Unauthorized, status));
        }
    }

    [Collection(RateLimitedCollection.Name)]
    public class WhenEnabled(RateLimitedApiFactory factory)
    {
        private static async Task<int> FirstThrottledAsync(int attempts, Func<Task<HttpResponseMessage>> send, HttpStatusCode expectedBefore)
        {
            for (var i = 0; i < attempts; i++)
            {
                var response = await send();
                if (response.StatusCode == HttpStatusCode.TooManyRequests)
                {
                    Assert.Equal(TooManyRequests, await response.ProblemTitleAsync());
                    return i;
                }

                Assert.Equal(expectedBefore, response.StatusCode);
            }

            return -1;
        }

        [Fact]
        public async Task LoginIsLimitedToTwentyRequestsPerMinute()
        {
            var client = factory.CreateAnonymousClient();

            var first = await FirstThrottledAsync(
                30,
                () => client.PostAsJsonAsync("/api/auth/login", new LoginDto { Email = "nobody@test.local", Password = "x" }),
                HttpStatusCode.Unauthorized);

            Assert.InRange(first, 15, 20);
        }

        [Fact]
        public async Task RegistrationAndPasswordChangeShareTheAuthLimit()
        {
            var client = factory.CreateAnonymousClient();

            var first = await FirstThrottledAsync(
                30,
                () => client.PostAsJsonAsync("/api/auth/register", new RegisterDto { Email = "bad", Username = "x", Password = "y" }),
                HttpStatusCode.BadRequest);

            Assert.InRange(first, 0, 20);
        }

        [Fact]
        public async Task AvailabilityCheckHasItsOwnHigherLimit()
        {
            var client = factory.CreateAnonymousClient();

            var first = await FirstThrottledAsync(80, () => client.GetAsync("/api/auth/availability?email=a@b.hu"), HttpStatusCode.OK);

            Assert.InRange(first, 55, 60);
        }

        [Fact]
        public async Task AiEndpointsAreLimitedPerUser_NotPerAddress()
        {
            var busy = await JwtTestTokens.CreateUserDirectlyAsync(factory);
            var calm = await JwtTestTokens.CreateUserDirectlyAsync(factory);

            var first = await FirstThrottledAsync(60, () => busy.Client.GetAsync("/api/ai/models"), HttpStatusCode.OK);

            Assert.InRange(first, 38, 40);
            await (await calm.Client.GetAsync("/api/ai/models")).AssertStatusAsync(HttpStatusCode.OK);
        }

        [Fact]
        public async Task DeckFillIsExemptFromThePerMinuteAiLimit()
        {
            var user = await JwtTestTokens.CreateUserDirectlyAsync(factory);
            var deck = await user.DefaultDeckAsync();
            var body = new GenerateDeckFillRequestDto
            {
                DeckId = deck.Id,
                Items = [new DeckFillItemDto { Term = "word", NeedDefinition = false }]
            };

            for (var i = 0; i < 50; i++)
            {
                await (await user.PostJsonAsync("/api/ai/generate/deck-fill", body)).AssertStatusAsync(HttpStatusCode.OK);
            }
        }

        [Fact]
        public async Task OtherEndpointsAreNotThrottled()
        {
            var user = await JwtTestTokens.CreateUserDirectlyAsync(factory);

            for (var i = 0; i < 60; i++)
            {
                await (await user.Client.GetAsync("/api/decks")).AssertStatusAsync(HttpStatusCode.OK);
            }
        }
    }
}
