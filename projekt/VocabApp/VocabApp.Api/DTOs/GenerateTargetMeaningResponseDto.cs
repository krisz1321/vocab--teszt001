using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class GenerateTargetMeaningResponseDto
{
    [MaxLength(CardLimits.MaxTargetMeaningsLength)]
    public string Meanings { get; set; } = string.Empty;
}
