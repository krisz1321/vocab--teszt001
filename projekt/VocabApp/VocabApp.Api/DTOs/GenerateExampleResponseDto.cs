using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateExampleResponseDto
{
    [MaxLength(500)]
    public string Example { get; set; } = string.Empty;

    public bool Reused { get; set; }
}
