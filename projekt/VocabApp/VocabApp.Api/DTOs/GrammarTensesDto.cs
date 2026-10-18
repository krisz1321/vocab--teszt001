using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class GrammarTensesDto
{
    [Required, MaxLength(50)]
    public List<string> Tenses { get; set; } = new();
}
