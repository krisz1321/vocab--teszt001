using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class AiCache
{
    public int Id { get; set; }

    [Required, MaxLength(64)]
    public string PromptHash { get; set; } = string.Empty;

    [Required]
    public string ResponseText { get; set; } = string.Empty;
}
