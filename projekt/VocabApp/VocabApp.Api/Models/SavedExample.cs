using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class SavedExample
{
    public int Id { get; set; }

    [Required, MaxLength(CardLimits.MaxTermLength)]
    public string TermKey { get; set; } = string.Empty;

    [Required, MaxLength(CardLimits.MaxDefinitionLength)]
    public string DefinitionKey { get; set; } = string.Empty;

    [Required, MaxLength(2)]
    public string Level { get; set; } = ExampleLevels.Default;

    [Required, MaxLength(CardLimits.MaxExampleLength)]
    public string Sentence { get; set; } = string.Empty;
}
