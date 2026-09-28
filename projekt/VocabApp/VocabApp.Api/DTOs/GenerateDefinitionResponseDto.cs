using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateDefinitionResponseDto
{
    [MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    public bool FromCard { get; set; }

    public bool Reused { get; set; }
}
