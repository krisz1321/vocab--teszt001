namespace VocabApp.Api.DTOs;

public sealed class CreateDeckDto
{
    public string? Name { get; set; }

    public string? Description { get; set; }

    // A pakli mondatszintje (A1–C2); üresen a fiók szintje érvényes.
    public string? ExampleLevel { get; set; }
}
