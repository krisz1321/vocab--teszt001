using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateTargetMeaningResponseDto
{
    [MaxLength(300)]
    public string Meanings { get; set; } = string.Empty;
}
