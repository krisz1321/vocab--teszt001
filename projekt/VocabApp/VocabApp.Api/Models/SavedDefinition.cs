using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class SavedDefinition
{
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string TermKey { get; set; } = string.Empty;

    [Required, MaxLength(2)]
    public string Level { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Definition { get; set; } = string.Empty;
}
