using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IAuthService
{
    Task<AuthResult> RegisterAsync(RegisterDto request, CancellationToken cancellationToken = default);

    Task<AuthResult> LoginAsync(LoginDto request, CancellationToken cancellationToken = default);

    Task<bool> DeleteAccountAsync(int userId, CancellationToken cancellationToken = default);

    Task<ProfileDto?> GetProfileAsync(int userId, CancellationToken cancellationToken = default);

    Task<StatusResult> UpdateDisplayNameAsync(int userId, string? displayName, CancellationToken cancellationToken = default);

    Task<StatusResult> ChangePasswordAsync(
        int userId,
        string? currentPassword,
        string? newPassword,
        CancellationToken cancellationToken = default);

    Task<StatusResult> SaveAvatarAsync(int userId, IFormFile? file, CancellationToken cancellationToken = default);

    Task DeleteAvatarAsync(int userId, CancellationToken cancellationToken = default);

    (string Path, string ContentType)? FindAvatar(int userId);
}
