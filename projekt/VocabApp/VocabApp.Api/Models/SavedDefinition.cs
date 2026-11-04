using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class SavedDefinition
{
    public int Id { get; set; }

    [Required, MaxLength(CardLimits.MaxTermLength)]
    public string TermKey { get; set; } = string.Empty;

    [Required, MaxLength(2)]
    public string Level { get; set; } = string.Empty;

    [Required, MaxLength(CardLimits.MaxDefinitionLength)]
    public string Definition { get; set; } = string.Empty;
}
