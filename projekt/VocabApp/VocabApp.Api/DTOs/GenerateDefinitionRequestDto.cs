using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateDefinitionRequestDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;
}
