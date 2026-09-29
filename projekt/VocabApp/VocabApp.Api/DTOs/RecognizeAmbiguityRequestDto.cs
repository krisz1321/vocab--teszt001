using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class RecognizeAmbiguityRequestDto
{
    [Range(1, int.MaxValue)]
    public int CardId { get; set; }

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string Guess { get; set; } = string.Empty;
}
