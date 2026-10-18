using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

// A Nyelvtan nézet egy MI-vel ellenőrzött mondata. Nem része az SM-2-nek; a kártya törlése után is megmarad.
public sealed class GrammarAttempt
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? CardId { get; set; }

    [Required, MaxLength(GrammarTenses.MaxKeyLength)]
    public string Tense { get; set; } = string.Empty;

    public bool IsCorrect { get; set; }

    public bool TermUsedCorrectly { get; set; }

    public bool TenseCorrect { get; set; }

    public bool GrammarCorrect { get; set; }

    public DateTime CreatedAt { get; set; }

    public User User { get; set; } = null!;

    public Card? Card { get; set; }
}
