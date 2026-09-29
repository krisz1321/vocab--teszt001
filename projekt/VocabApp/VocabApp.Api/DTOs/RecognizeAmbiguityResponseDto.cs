using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class RecognizeAmbiguityResponseDto
{
    public bool MatchesTerm { get; set; }

    public bool FitsGuess { get; set; }

    [MaxLength(500)]
    public string? Hint { get; set; }
}
