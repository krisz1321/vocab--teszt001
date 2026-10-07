using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IAuthService authService) : ControllerBase
{
    [EnableRateLimiting("auth")]
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponseDto>> Register(
        RegisterDto request,
        CancellationToken cancellationToken)
    {
        return ToActionResult(await authService.RegisterAsync(request, cancellationToken));
    }

    [EnableRateLimiting("availability")]
    [HttpGet("availability")]
    public async Task<ActionResult<AvailabilityDto>> Availability(
        [FromQuery] string? email,
        [FromQuery] string? username,
        CancellationToken cancellationToken)
    {
        return Ok(await authService.CheckAvailabilityAsync(email, username, cancellationToken));
    }

    [EnableRateLimiting("auth")]
    [HttpPost("login")]
    public async Task<ActionResult<AuthResponseDto>> Login(
        LoginDto request,
        CancellationToken cancellationToken)
    {
        return ToActionResult(await authService.LoginAsync(request, cancellationToken));
    }

    [Authorize]
    [HttpGet("profile")]
    public async Task<ActionResult<ProfileDto>> GetProfile(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var profile = await authService.GetProfileAsync(userId.Value, cancellationToken);
        return profile is null
            ? NotFound(new ProblemDetails { Title = "A felhasználó nem található.", Status = StatusCodes.Status404NotFound })
            : Ok(profile);
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile(UpdateProfileDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToStatus(await authService.UpdateDisplayNameAsync(userId.Value, request.DisplayName, cancellationToken));
    }

    [Authorize]
    [HttpPut("profile/username")]
    public async Task<IActionResult> UpdateUsername(UpdateUsernameDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToStatus(await authService.UpdateUsernameAsync(userId.Value, request.Username, cancellationToken));
    }

    [Authorize]
    [EnableRateLimiting("auth")]
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToStatus(await authService.ChangePasswordAsync(
            userId.Value,
            request.CurrentPassword,
            request.NewPassword,
            cancellationToken));
    }

    [Authorize]
    [HttpPut("avatar")]
    [RequestSizeLimit(8 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 8 * 1024 * 1024)]
    public async Task<IActionResult> UploadAvatar([FromForm] IFormFile? file, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToStatus(await authService.SaveAvatarAsync(userId.Value, file, cancellationToken));
    }

    [Authorize]
    [HttpDelete("avatar")]
    public async Task<IActionResult> DeleteAvatar(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        await authService.DeleteAvatarAsync(userId.Value, cancellationToken);
        return NoContent();
    }

    [AllowAnonymous]
    [HttpGet("avatar/{userId:int}")]
    public IActionResult GetAvatar(int userId)
    {
        var avatar = authService.FindAvatar(userId);
        if (avatar is null)
        {
            return NotFound();
        }

        return PhysicalFile(avatar.Value.Path, avatar.Value.ContentType);
    }

    [Authorize]
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var deleted = await authService.DeleteAccountAsync(userId.Value, cancellationToken);
        return deleted
            ? NoContent()
            : NotFound(new ProblemDetails { Title = "A felhasználó nem található.", Status = StatusCodes.Status404NotFound });
    }

    private int? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(sub, out var userId) ? userId : null;
    }

    private IActionResult ToStatus(StatusResult result)
    {
        if (result.IsSuccess)
        {
            return StatusCode(result.Status);
        }

        return StatusCode(
            result.Status,
            new ProblemDetails
            {
                Title = result.ErrorTitle,
                Status = result.Status
            });
    }

    private ActionResult<AuthResponseDto> ToActionResult(AuthResult result)
    {
        if (result.Response is not null)
        {
            return Ok(result.Response);
        }

        return StatusCode(
            result.ErrorStatus ?? StatusCodes.Status500InternalServerError,
            new ProblemDetails
            {
                Title = result.ErrorTitle,
                Status = result.ErrorStatus
            });
    }
}
