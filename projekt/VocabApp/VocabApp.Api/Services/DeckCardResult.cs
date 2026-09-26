namespace VocabApp.Api.Services;

public sealed class DeckCardResult<T>
{
    public T? Value { get; private init; }

    public int? ErrorStatus { get; private init; }

    public string? ErrorTitle { get; private init; }

    public static DeckCardResult<T> Success(T value) => new() { Value = value };

    public static DeckCardResult<T> Fail(int status, string title) => new() { ErrorStatus = status, ErrorTitle = title };
}
