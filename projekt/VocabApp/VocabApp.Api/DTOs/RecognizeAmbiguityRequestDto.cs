using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class RecognizeAmbiguityRequestDto
{
    [Range(1, int.MaxValue)]
    public int CardId { get; set; }

    [Required, MaxLength(CardLimits.MaxDefinitionLength)]
    public string Definition { get; set; } = string.Empty;

    [Required, MaxLength(CardLimits.MaxTermLength)]
    public string Guess { get; set; } = string.Empty;
}
