using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class StudySubmitDto
{
    [Range(1, int.MaxValue, ErrorMessage = "A kártya azonosítója érvénytelen.")]
    public int CardId { get; set; }

    public bool IsCorrect { get; set; }

    [Required(ErrorMessage = "A válasz tokenje hiányzik.")]
    public string AnswerToken { get; set; } = string.Empty;

    [MaxLength(100, ErrorMessage = "A beírt válasz legfeljebb 100 karakter lehet.")]
    public string? TypedAnswer { get; set; }
}
