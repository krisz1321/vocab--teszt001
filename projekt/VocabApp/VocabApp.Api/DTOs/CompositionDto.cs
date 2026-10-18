using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class CompositionCheckRequestDto
{
    [Required, MinLength(CompositionLimits.MinWords), MaxLength(CompositionLimits.MaxWords)]
    public List<int> CardIds { get; set; } = [];

    [Required, MaxLength(CompositionLimits.MaxTextLength)]
    public string Text { get; set; } = string.Empty;
}

public sealed class CompositionWordResultDto
{
    public int CardId { get; set; }

    public string Term { get; set; } = string.Empty;

    public bool UsedCorrectly { get; set; }
}

public sealed class CompositionCheckResponseDto
{
    /// <summary>A mentett CompositionAttempt azonosítója (a kézi elfogadáshoz).</summary>
    public int AttemptId { get; set; }

    public bool IsCorrect { get; set; }

    /// <summary>Szavanként, a kérés sorrendjében.</summary>
    public List<CompositionWordResultDto> Words { get; set; } = [];

    public bool GrammarCorrect { get; set; }

    public bool Coherent { get; set; }

    [MaxLength(500)]
    public string Feedback { get; set; } = string.Empty;

    [MaxLength(500)]
    public string CorrectedText { get; set; } = string.Empty;

    /// <summary>A tanuló szövegének magyar jelentése; üres, ha a GrammarShowTranslation ki van kapcsolva.</summary>
    [MaxLength(500)]
    public string HungarianTranslation { get; set; } = string.Empty;
}

/// <summary>A példa és a tipp kérése: a feladat szavai.</summary>
public sealed class CompositionCardsRequestDto
{
    [Required, MinLength(CompositionLimits.MinWords), MaxLength(CompositionLimits.MaxWords)]
    public List<int> CardIds { get; set; } = [];
}

public sealed class CompositionExampleResponseDto
{
    [MaxLength(500)]
    public string Example { get; set; } = string.Empty;
}

public sealed class CompositionHintResponseDto
{
    [MaxLength(500)]
    public string Text { get; set; } = string.Empty;
}
