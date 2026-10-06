using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VocabApp.Api.Data;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;

namespace VocabApp.Api.Services;

public sealed class AuthService(
    AppDbContext dbContext,
    IPasswordHasher<User> passwordHasher,
    IConfiguration configuration,
    IWebHostEnvironment environment) : IAuthService
{
    private const int MaxEmailLength = 256;
    private const int MaxDisplayNameLength = 80;
    private const int MaxAvatarBytes = 1024 * 1024;
    private const string InvalidCredentials = "Hibás email vagy jelszó.";
    private const string InvalidAvatar = "Csak JPEG, PNG vagy WebP kép tölthető fel, legfeljebb 1 MB.";
    private static readonly EmailAddressAttribute EmailValidator = new();
    private static readonly (string Extension, string ContentType)[] AvatarTypes =
    [
        (".jpg", "image/jpeg"),
        (".png", "image/png"),
        (".webp", "image/webp")
    ];

    public async Task<AuthResult> RegisterAsync(RegisterDto request, CancellationToken cancellationToken = default)
    {
        var email = NormalizeEmail(request.Email);
        if (email is null)
        {
            return AuthResult.Fail(StatusCodes.Status400BadRequest, "Az email megadása kötelező.");
        }

        if (email.Length > MaxEmailLength)
        {
            return AuthResult.Fail(StatusCodes.Status400BadRequest, "Az email cím legfeljebb 256 karakter lehet.");
        }

        if (!EmailValidator.IsValid(email))
        {
            return AuthResult.Fail(StatusCodes.Status400BadRequest, "Az email cím formátuma érvénytelen.");
        }

        if (string.IsNullOrEmpty(request.Password) || request.Password.Length < 8)
        {
            return AuthResult.Fail(StatusCodes.Status400BadRequest, "A jelszónak legalább 8 karakter hosszúnak kell lennie.");
        }

        if (await dbContext.Users.AnyAsync(user => user.Email == email, cancellationToken))
        {
            return AuthResult.Fail(StatusCodes.Status409Conflict, "Ez az email cím már regisztrálva van.");
        }

        var user = new User { Email = email };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        dbContext.Users.Add(user);
        dbContext.Decks.Add(new Deck { User = user, Name = "Saját pakli" });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            return AuthResult.Fail(StatusCodes.Status409Conflict, "Ez az email cím már regisztrálva van.");
        }

        return AuthResult.Success(CreateResponse(user));
    }

    public async Task<AuthResult> LoginAsync(LoginDto request, CancellationToken cancellationToken = default)
    {
        var email = NormalizeEmail(request.Email);
        if (email is null || string.IsNullOrEmpty(request.Password))
        {
            return AuthResult.Fail(StatusCodes.Status401Unauthorized, InvalidCredentials);
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(candidate => candidate.Email == email, cancellationToken);
        if (user is null)
        {
            return AuthResult.Fail(StatusCodes.Status401Unauthorized, InvalidCredentials);
        }

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            return AuthResult.Fail(StatusCodes.Status401Unauthorized, InvalidCredentials);
        }

        return AuthResult.Success(CreateResponse(user));
    }

    public async Task<bool> DeleteAccountAsync(int userId, CancellationToken cancellationToken = default)
    {
        var user = await dbContext.Users.FirstOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return false;
        }

        dbContext.Users.Remove(user);
        await dbContext.SaveChangesAsync(cancellationToken);
        DeleteAvatarFiles(userId);
        return true;
    }

    public async Task<ProfileDto?> GetProfileAsync(int userId, CancellationToken cancellationToken = default)
    {
        var user = await dbContext.Users.FirstOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        return ToProfile(user);
    }

    public async Task<StatusResult> UpdateDisplayNameAsync(
        int userId,
        string? displayName,
        CancellationToken cancellationToken = default)
    {
        var user = await dbContext.Users.FirstOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null)
        {
            return StatusResult.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.");
        }

        var normalized = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim();
        if (normalized is not null && normalized.Length > MaxDisplayNameLength)
        {
            return StatusResult.Fail(
                StatusCodes.Status400BadRequest,
                "A megjelenített név legfeljebb 80 karakter lehet.");
        }

        user.DisplayName = normalized;
        await dbContext.SaveChangesAsync(cancellationToken);
        return StatusResult.Success();
    }

    public async Task<StatusResult> ChangePasswordAsync(
        int userId,
        string? currentPassword,
        string? newPassword,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 8)
        {
            return StatusResult.Fail(
                StatusCodes.Status400BadRequest,
                "Az új jelszónak legalább 8 karakter hosszúnak kell lennie.");
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(candidate => candidate.Id == userId, cancellationToken);
        if (user is null || string.IsNullOrEmpty(currentPassword))
        {
            return StatusResult.Fail(StatusCodes.Status401Unauthorized, "Hibás jelszó.");
        }

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, currentPassword);
        if (verification == PasswordVerificationResult.Failed)
        {
            return StatusResult.Fail(StatusCodes.Status401Unauthorized, "Hibás jelszó.");
        }

        user.PasswordHash = passwordHasher.HashPassword(user, newPassword);
        await dbContext.SaveChangesAsync(cancellationToken);
        return StatusResult.Success();
    }

    public async Task<StatusResult> SaveAvatarAsync(
        int userId,
        IFormFile? file,
        CancellationToken cancellationToken = default)
    {
        if (!await dbContext.Users.AnyAsync(candidate => candidate.Id == userId, cancellationToken))
        {
            return StatusResult.Fail(StatusCodes.Status404NotFound, "A felhasználó nem található.");
        }

        var extension = ExtensionFor(file?.ContentType);
        if (file is null || file.Length <= 0 || file.Length > MaxAvatarBytes || extension is null)
        {
            return StatusResult.Fail(StatusCodes.Status400BadRequest, InvalidAvatar);
        }

        await using var input = file.OpenReadStream();
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        long total = 0;
        int read;
        while ((read = await input.ReadAsync(chunk, cancellationToken)) > 0)
        {
            total += read;
            if (total > MaxAvatarBytes)
            {
                return StatusResult.Fail(StatusCodes.Status400BadRequest, InvalidAvatar);
            }

            buffer.Write(chunk, 0, read);
        }

        if (total == 0)
        {
            return StatusResult.Fail(StatusCodes.Status400BadRequest, InvalidAvatar);
        }

        var directory = AvatarDirectory();
        Directory.CreateDirectory(directory);
        var tempPath = Path.Combine(directory, $"{userId}{extension}.tmp");
        var targetPath = Path.Combine(directory, $"{userId}{extension}");
        await File.WriteAllBytesAsync(tempPath, buffer.ToArray(), cancellationToken);
        File.Move(tempPath, targetPath, overwrite: true);

        foreach (var (otherExtension, _) in AvatarTypes)
        {
            if (otherExtension == extension)
            {
                continue;
            }

            var otherPath = Path.Combine(directory, $"{userId}{otherExtension}");
            if (File.Exists(otherPath))
            {
                File.Delete(otherPath);
            }
        }

        return StatusResult.Success();
    }

    public Task DeleteAvatarAsync(int userId, CancellationToken cancellationToken = default)
    {
        DeleteAvatarFiles(userId);
        return Task.CompletedTask;
    }

    public (string Path, string ContentType)? FindAvatar(int userId)
    {
        if (userId <= 0)
        {
            return null;
        }

        var directory = AvatarDirectory();
        foreach (var (extension, contentType) in AvatarTypes)
        {
            var path = Path.Combine(directory, $"{userId}{extension}");
            if (File.Exists(path))
            {
                return (path, contentType);
            }
        }

        return null;
    }

    private AuthResponseDto CreateResponse(User user)
    {
        var key = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key is required.");
        var issuer = configuration["Jwt:Issuer"]
            ?? throw new InvalidOperationException("Jwt:Issuer is required.");
        var audience = configuration["Jwt:Audience"]
            ?? throw new InvalidOperationException("Jwt:Audience is required.");
        var expiresDays = configuration.GetValue<int?>("Jwt:ExpiresDays")
            ?? throw new InvalidOperationException("Jwt:ExpiresDays is required.");

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email)
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(expiresDays),
            signingCredentials: credentials);

        return new AuthResponseDto
        {
            Token = new JwtSecurityTokenHandler().WriteToken(token),
            Email = user.Email
        };
    }

    private static string? NormalizeEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return null;
        }

        return email.Trim().ToLowerInvariant();
    }

    private ProfileDto ToProfile(User user)
    {
        return new ProfileDto
        {
            Email = user.Email,
            DisplayName = user.DisplayName,
            HasAvatar = FindAvatar(user.Id) is not null,
            StudyDayStreak = StudyService.CurrentStudyDayStreak(
                user.StudyDayStreak,
                user.LastStudyDate,
                StudyClock.LocalDate(user.TimeZoneId, DateTime.UtcNow))
        };
    }

    private string AvatarDirectory() => Path.Combine(environment.ContentRootPath, "App_Data", "avatars");

    private void DeleteAvatarFiles(int userId)
    {
        var directory = AvatarDirectory();
        if (!Directory.Exists(directory))
        {
            return;
        }

        foreach (var (extension, _) in AvatarTypes)
        {
            var path = Path.Combine(directory, $"{userId}{extension}");
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            var tempPath = Path.Combine(directory, $"{userId}{extension}.tmp");
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private static string? ExtensionFor(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return null;
        }

        var mediaType = contentType.Split(';', 2)[0].Trim();
        foreach (var (extension, type) in AvatarTypes)
        {
            if (string.Equals(mediaType, type, StringComparison.OrdinalIgnoreCase))
            {
                return extension;
            }
        }

        return null;
    }

    private static bool IsUniqueViolation(DbUpdateException exception)
    {
        for (Exception? current = exception.InnerException; current is not null; current = current.InnerException)
        {
            if (current is SqliteException sqlite && sqlite.SqliteErrorCode == 19)
            {
                return true;
            }
        }

        return false;
    }
}
