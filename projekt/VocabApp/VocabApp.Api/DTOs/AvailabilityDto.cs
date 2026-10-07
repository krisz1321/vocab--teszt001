namespace VocabApp.Api.DTOs;

/// <summary>Regisztráció előtti ellenőrzés: az email és a felhasználónév foglalt-e. Üres bemenetnél null.</summary>
public sealed class AvailabilityDto
{
    public bool? EmailTaken { get; set; }

    public bool? UsernameTaken { get; set; }
}
