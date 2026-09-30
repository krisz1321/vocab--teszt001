using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class MarkFreeStudyDto
{
    [Required]
    public bool? Knows { get; set; }
}
