namespace VocabApp.Api.Models;

// A Mondatok nézet egy MI-vel ellenőrzött szövege (1-2 mondat több kártya szavával). Nem része az SM-2-nek.
public sealed class CompositionAttempt
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public bool IsCorrect { get; set; }

    public bool GrammarCorrect { get; set; }

    // Legfeljebb két mondat, és ha kettő, összefüggenek.
    public bool Coherent { get; set; }

    // A tanuló az MI hibás ítélete után kézzel helyesnek jelölte ("Márpedig jó volt"); ilyenkor IsCorrect is true.
    public bool ManuallyAccepted { get; set; }

    public DateTime CreatedAt { get; set; }

    public User User { get; set; } = null!;

    public List<CompositionAttemptWord> Words { get; set; } = [];
}
