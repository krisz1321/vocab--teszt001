using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class AppealAnswerRequestDto
{
    [Required, MaxLength(CardLimits.MaxTermLength)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(CardLimits.MaxDefinitionLength)]
    public string Definition { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Answer { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;
}
