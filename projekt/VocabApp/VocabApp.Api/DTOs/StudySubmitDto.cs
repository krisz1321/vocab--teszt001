using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class StudySubmitDto
{
    [Range(1, int.MaxValue)]
    public int CardId { get; set; }

    public bool IsCorrect { get; set; }

    [Required]
    public string AnswerToken { get; set; } = string.Empty;
}
