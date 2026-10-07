using System.ComponentModel.DataAnnotations;
using VocabApp.Api.Models;

namespace VocabApp.Api.DTOs;

public sealed class GenerateDeckFillRequestDto
{
    [Range(1, int.MaxValue)]
    public int DeckId { get; set; }

    [Required, MinLength(1), MaxLength(AiFillLimits.MaxBatchSize)]
    public List<DeckFillItemDto> Items { get; set; } = [];
}

public sealed class DeckFillItemDto
{
    [Required, MaxLength(100)]
    public string Term { get; set; } = string.Empty;

    // A beillesztett magyar jelentés: csak a szó értelmét pontosítja a promptban.
    [MaxLength(200)]
    public string? TargetMeanings { get; set; }

    public bool NeedDefinition { get; set; }

    public bool NeedExample { get; set; }

    // Ha csak a példa hiányzik, a már meglévő definíció, hogy a mondat ahhoz az értelemhez illeszkedjen.
    [MaxLength(500)]
    public string? Definition { get; set; }
}

public sealed class GenerateDeckFillResponseDto
{
    public List<DeckFillResultDto> Items { get; set; } = [];

    public int UsedToday { get; set; }

    public int DailyLimit { get; set; }

    public int RemainingToday { get; set; }
}

public sealed class DeckFillResultDto
{
    // A kérésben szereplő elem sorszáma (0-tól).
    public int Index { get; set; }

    public string? Definition { get; set; }

    public string? Example { get; set; }

    // Ha egy kért mező nem készült el, a hiba oka. A többi elem ettől még érvényes.
    public string? Error { get; set; }
}
