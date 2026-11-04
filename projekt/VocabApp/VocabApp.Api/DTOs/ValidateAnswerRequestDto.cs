using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class ValidateAnswerRequestDto
{
    [Required, MaxLength(CardLimits.MaxTermLength)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(CardLimits.MaxDefinitionLength)]
    public string Definition { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Answer { get; set; } = string.Empty;

    public bool Paraphrase { get; set; }

    /// <summary>A tanuló magyar jelentést látott, és az angol szót írta be; a Definition ilyenkor a magyar jelentés.</summary>
    public bool ToEnglish { get; set; }
}
