namespace VocabApp.Api.Services;

public enum AiServiceErrorKind
{
    Configuration,
    Upstream,
    InvalidResponse,
    LimitReached
}

public sealed class AiServiceException : Exception
{
    public AiServiceErrorKind Kind { get; }

    public AiServiceException(AiServiceErrorKind kind, string message)
        : base(message)
    {
        Kind = kind;
    }

    public AiServiceException(AiServiceErrorKind kind, string message, Exception innerException)
        : base(message, innerException)
    {
        Kind = kind;
    }
}
