using System.ComponentModel.DataAnnotations;

namespace VocabApp.Api.Models;

public sealed class Deck
{
    public int Id { get; set; }

    public int UserId { get; set; }

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public bool IsPublic { get; set; }

    [MaxLength(2)]
    public string? ExampleLevel { get; set; }

    public User User { get; set; } = null!;

    public ICollection<Card> Cards { get; set; } = new List<Card>();
}
