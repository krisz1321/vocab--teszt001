using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.DTOs;

public sealed class ShareDeckDto
{
    public bool IsPublic { get; set; }

    /// <summary>
    /// Megosztáskor megadható mondatszint (A1–C2). Ha üres, a pakli szintje marad,
    /// annak hiányában pedig automatikusan a készítő fiókszintje számít.
    /// </summary>
    [MaxLength(2)]
    public string? ExampleLevel { get; set; }
}
