using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateTargetMeaningRequestDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;
}
