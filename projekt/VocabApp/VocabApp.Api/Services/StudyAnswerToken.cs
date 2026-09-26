using System.Security.Cryptography;
using System.Text;

namespace VocabApp.Api.Services;

public enum StudyAnswerTokenStatus
{
    Valid,
    Invalid,
    TooEarly
}

public readonly record struct StudyAnswerEvaluation(StudyAnswerTokenStatus Status, DateTime? ShownAtUtc);

public sealed class StudyAnswerToken(IConfiguration configuration)
{
    private static readonly TimeSpan MaximumAge = TimeSpan.FromHours(12);
    private static readonly TimeSpan FutureSkew = TimeSpan.FromSeconds(5);
    private readonly byte[] key = CreateKey(configuration);

    public string Create(int userId, int cardId, DateTime utcNow)
    {
        var unixSeconds = new DateTimeOffset(utcNow).ToUnixTimeSeconds();
        var payload = Encoding.UTF8.GetBytes($"{userId}:{cardId}:{unixSeconds}");
        var signature = HMACSHA256.HashData(key, payload);
        return $"{ToBase64Url(payload)}.{ToBase64Url(signature)}";
    }

    public StudyAnswerEvaluation Evaluate(
        string? token,
        int userId,
        int cardId,
        int minimumAnswerSeconds,
        DateTime utcNow)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return Invalid();
        }

        var separator = token.IndexOf('.');
        if (separator <= 0 || separator != token.LastIndexOf('.'))
        {
            return Invalid();
        }

        var payload = FromBase64Url(token[..separator]);
        var signature = FromBase64Url(token[(separator + 1)..]);
        if (payload is null || signature is null)
        {
            return Invalid();
        }

        var expected = HMACSHA256.HashData(key, payload);
        if (signature.Length != expected.Length || !CryptographicOperations.FixedTimeEquals(signature, expected))
        {
            return Invalid();
        }

        var text = Encoding.UTF8.GetString(payload);
        var parts = text.Split(':');
        if (parts.Length != 3
            || !int.TryParse(parts[0], out var tokenUserId)
            || !int.TryParse(parts[1], out var tokenCardId)
            || !long.TryParse(parts[2], out var unixSeconds)
            || tokenUserId != userId
            || tokenCardId != cardId)
        {
            return Invalid();
        }

        DateTime tokenTime;
        try
        {
            tokenTime = DateTimeOffset.FromUnixTimeSeconds(unixSeconds).UtcDateTime;
        }
        catch (ArgumentOutOfRangeException)
        {
            return Invalid();
        }

        if (tokenTime > utcNow.Add(FutureSkew) || utcNow - tokenTime > MaximumAge)
        {
            return Invalid();
        }

        if (utcNow - tokenTime < TimeSpan.FromSeconds(minimumAnswerSeconds))
        {
            return new StudyAnswerEvaluation(StudyAnswerTokenStatus.TooEarly, tokenTime);
        }

        return new StudyAnswerEvaluation(StudyAnswerTokenStatus.Valid, tokenTime);
    }

    private static StudyAnswerEvaluation Invalid() =>
        new(StudyAnswerTokenStatus.Invalid, null);

    private static byte[] CreateKey(IConfiguration configuration)
    {
        var value = configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException("Jwt:Key is required.");
        }

        return Encoding.UTF8.GetBytes(value);
    }

    private static string ToBase64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[]? FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        var remainder = padded.Length % 4;
        if (remainder == 1)
        {
            return null;
        }

        if (remainder > 0)
        {
            padded = padded.PadRight(padded.Length + (4 - remainder), '=');
        }

        try
        {
            return Convert.FromBase64String(padded);
        }
        catch (FormatException)
        {
            return null;
        }
    }
}
