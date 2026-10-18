namespace VocabApp.Api.Models;

// A CompositionAttempt egy szava; a kártya törlése után is megmarad (CardId null lesz).
public sealed class CompositionAttemptWord
{
    public int Id { get; set; }

    public int AttemptId { get; set; }

    public int? CardId { get; set; }

    public bool UsedCorrectly { get; set; }

    public CompositionAttempt Attempt { get; set; } = null!;

    public Card? Card { get; set; }
}
