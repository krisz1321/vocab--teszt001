using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class GenerateExampleResponseDto
{
    [MaxLength(CardLimits.MaxExampleLength)]
    public string Example { get; set; } = string.Empty;

    public bool Reused { get; set; }
}
