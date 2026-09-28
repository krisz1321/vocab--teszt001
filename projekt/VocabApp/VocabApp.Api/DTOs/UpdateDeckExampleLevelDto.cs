using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class UpdateDeckExampleLevelDto
{
    [MaxLength(2)]
    public string? ExampleLevel { get; set; }
}
