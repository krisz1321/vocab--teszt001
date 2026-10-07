namespace VocabApp.Api.DTOs;

public sealed class ProfileDto
{
    public string Email { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;

    public string? DisplayName { get; set; }

    public bool HasAvatar { get; set; }

    public int StudyDayStreak { get; set; }
}
