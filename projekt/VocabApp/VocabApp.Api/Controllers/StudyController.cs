using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/study")]
public sealed class StudyController(IStudyService studyService) : ControllerBase
{
    [HttpGet("stats")]
    public async Task<ActionResult<StudyStatsDto>> GetStats(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return Ok(await studyService.GetStatsAsync(userId.Value, cancellationToken));
    }

    [HttpGet("settings")]
    public async Task<ActionResult<StudySettingsDto>> GetSettings(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var settings = await studyService.GetSettingsAsync(userId.Value, cancellationToken);
        return settings is null
            ? NotFound(new ProblemDetails { Title = "User not found", Status = StatusCodes.Status404NotFound })
            : Ok(settings);
    }

    [HttpPut("settings")]
    public async Task<ActionResult<StudySettingsDto>> UpdateSettings(
        StudySettingsDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await studyService.UpdateSettingsAsync(userId.Value, request, cancellationToken);
        if (result.Value is not null)
        {
            return Ok(result.Value);
        }

        return StatusCode(
            result.ErrorStatus ?? StatusCodes.Status500InternalServerError,
            new ProblemDetails
            {
                Title = result.ErrorTitle,
                Status = result.ErrorStatus
            });
    }

    [HttpGet("next")]
    public async Task<ActionResult<StudyNextDto>> GetNext(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return Ok(await studyService.GetNextCardAsync(userId.Value, cancellationToken));
    }

    [HttpPost("submit")]
    public async Task<ActionResult<CardProgressDto>> Submit(
        StudySubmitDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await studyService.SubmitAsync(userId.Value, request, cancellationToken);
        if (result.Progress is not null)
        {
            return Ok(result.Progress);
        }

        return StatusCode(
            result.ErrorStatus ?? StatusCodes.Status400BadRequest,
            new ProblemDetails
            {
                Title = result.ErrorTitle,
                Status = result.ErrorStatus
            });
    }

    private int? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(sub, out var userId) ? userId : null;
    }
}
