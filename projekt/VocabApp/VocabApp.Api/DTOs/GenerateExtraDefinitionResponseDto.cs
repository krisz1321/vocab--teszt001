using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GenerateExtraDefinitionResponseDto
{
    public const string AlternateDisabled = "alternateDisabled";

    public const string NotDifferentEnough = "notDifferentEnough";

    public bool Available { get; set; }

    [MaxLength(500)]
    public string Definition { get; set; } = string.Empty;

    public string? Reason { get; set; }
}
