using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateDefinitionResponseDto
{
    [MaxLength(500)]
    public string Definition { get; set; } = string.Empty;
}
