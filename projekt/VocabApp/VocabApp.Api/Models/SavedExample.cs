using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class SavedExample
{
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string TermKey { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string DefinitionKey { get; set; } = string.Empty;

    [Required, MaxLength(2)]
    public string Level { get; set; } = ExampleLevels.Default;

    [Required, MaxLength(500)]
    public string Sentence { get; set; } = string.Empty;
}
