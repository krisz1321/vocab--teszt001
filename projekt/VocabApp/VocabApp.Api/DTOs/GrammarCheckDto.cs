using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GrammarCheckRequestDto
{
    [Range(1, int.MaxValue)]
    public int CardId { get; set; }

    [Required, MaxLength(32)]
    public string Tense { get; set; } = string.Empty;

    [Required, MaxLength(300)]
    public string Sentence { get; set; } = string.Empty;
}

public sealed class GrammarCheckResponseDto
{
    /// <summary>A mentett GrammarAttempt azonosítója (a kézi elfogadáshoz).</summary>
    public int AttemptId { get; set; }

    public bool IsCorrect { get; set; }

    public bool TermUsedCorrectly { get; set; }

    public bool TenseCorrect { get; set; }

    public bool GrammarCorrect { get; set; }

    [MaxLength(500)]
    public string Feedback { get; set; } = string.Empty;

    [MaxLength(500)]
    public string CorrectedSentence { get; set; } = string.Empty;

    /// <summary>A tanuló mondatának magyar jelentése; üres, ha a GrammarShowTranslation ki van kapcsolva.</summary>
    [MaxLength(500)]
    public string HungarianTranslation { get; set; } = string.Empty;
}
