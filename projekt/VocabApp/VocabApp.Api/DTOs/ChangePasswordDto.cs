namespace VocabApp.Api.DTOs;

public sealed class ChangePasswordDto
{
    public string? CurrentPassword { get; set; }

    public string? NewPassword { get; set; }
}
