using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class ValidateAnswerRequestDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Answer { get; set; } = string.Empty;

    public bool Paraphrase { get; set; }

    /// <summary>A tanuló magyar jelentést látott, és az angol szót írta be; a Definition ilyenkor a magyar jelentés.</summary>
    public bool ToEnglish { get; set; }
}
