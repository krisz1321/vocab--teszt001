using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class GenerateCardDefinitionResponseDto
{
    [MaxLength(CardLimits.MaxDefinitionLength)]
    public string Definition { get; set; } = string.Empty;
}
