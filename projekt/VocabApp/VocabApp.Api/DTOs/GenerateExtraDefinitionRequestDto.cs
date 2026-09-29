using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateExtraDefinitionRequestDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string AvoidDefinition { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int CardId { get; set; }
}
