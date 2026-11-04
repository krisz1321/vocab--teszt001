using System.Text;
using Microsoft.Extensions.Configuration;
using VocabApp.Api.Services;

namespace VocabApp.Api.Tests;

public class StudyAnswerTokenTests
{
    private static readonly DateTime Now = new(2026, 11, 4, 12, 0, 0, DateTimeKind.Utc);

    private static StudyAnswerToken CreateService(string key = "test-signing-key-with-enough-length-1234")
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = key })
            .Build();
        return new StudyAnswerToken(configuration);
    }

    [Fact]
    public void Constructor_MissingKey_Throws()
    {
        var configuration = new ConfigurationBuilder().Build();

        Assert.Throws<InvalidOperationException>(() => new StudyAnswerToken(configuration));
    }

    [Fact]
    public void Evaluate_FreshTokenAfterMinimumTime_IsValid()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);

        var result = service.Evaluate(token, 1, 42, 2, Now.AddSeconds(10));

        Assert.Equal(StudyAnswerTokenStatus.Valid, result.Status);
        Assert.Equal(Now, result.ShownAtUtc);
    }

    [Fact]
    public void Evaluate_AnsweredTooFast_IsTooEarly()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);

        var result = service.Evaluate(token, 1, 42, 3, Now.AddSeconds(1));

        Assert.Equal(StudyAnswerTokenStatus.TooEarly, result.Status);
        Assert.NotNull(result.ShownAtUtc);
    }

    [Fact]
    public void Evaluate_ZeroMinimumSeconds_AcceptsImmediateAnswer()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);

        Assert.Equal(StudyAnswerTokenStatus.Valid, service.Evaluate(token, 1, 42, 0, Now).Status);
    }

    [Fact]
    public void Evaluate_ExpiredToken_IsInvalid()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);

        var result = service.Evaluate(token, 1, 42, 0, Now.AddHours(12).AddSeconds(1));

        Assert.Equal(StudyAnswerTokenStatus.Invalid, result.Status);
        Assert.Null(result.ShownAtUtc);
    }

    [Fact]
    public void Evaluate_TokenBeforeExpiry_IsStillValid()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);

        Assert.Equal(StudyAnswerTokenStatus.Valid, service.Evaluate(token, 1, 42, 0, Now.AddHours(11)).Status);
    }

    [Fact]
    public void Evaluate_TokenFromTheFuture_IsInvalid()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now.AddMinutes(5));

        Assert.Equal(StudyAnswerTokenStatus.Invalid, service.Evaluate(token, 1, 42, 0, Now).Status);
    }

    [Fact]
    public void Evaluate_OtherUser_IsInvalid()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);

        Assert.Equal(StudyAnswerTokenStatus.Invalid, service.Evaluate(token, 2, 42, 0, Now.AddSeconds(10)).Status);
    }

    [Fact]
    public void Evaluate_OtherCard_IsInvalid()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);

        Assert.Equal(StudyAnswerTokenStatus.Invalid, service.Evaluate(token, 1, 43, 0, Now.AddSeconds(10)).Status);
    }

    [Fact]
    public void Evaluate_TokenSignedWithOtherKey_IsInvalid()
    {
        var token = CreateService("another-signing-key-with-enough-length-99").Create(1, 42, Now);

        Assert.Equal(StudyAnswerTokenStatus.Invalid, CreateService().Evaluate(token, 1, 42, 0, Now.AddSeconds(10)).Status);
    }

    [Fact]
    public void Evaluate_TamperedPayload_IsInvalid()
    {
        var service = CreateService();
        var token = service.Create(1, 42, Now);
        var signature = token[(token.IndexOf('.') + 1)..];
        var olderSeconds = new DateTimeOffset(Now).ToUnixTimeSeconds() - 1000;
        var forgedPayload = Convert.ToBase64String(Encoding.UTF8.GetBytes($"1:42:{olderSeconds}")).TrimEnd('=');

        var result = service.Evaluate($"{forgedPayload}.{signature}", 1, 42, 0, Now.AddSeconds(10));

        Assert.Equal(StudyAnswerTokenStatus.Invalid, result.Status);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("nincs-pont")]
    [InlineData(".")]
    [InlineData("a.b.c")]
    [InlineData("!!!.???")]
    public void Evaluate_MalformedToken_IsInvalid(string? token)
    {
        var result = CreateService().Evaluate(token, 1, 42, 0, Now);

        Assert.Equal(StudyAnswerTokenStatus.Invalid, result.Status);
        Assert.Null(result.ShownAtUtc);
    }
}
