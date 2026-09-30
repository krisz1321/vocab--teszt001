using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/free-study")]
public sealed class FreeStudyController(IFreeStudyService freeStudyService) : ControllerBase
{
    [HttpGet("cards")]
    public async Task<ActionResult<IReadOnlyList<FreeStudyCardDto>>> GetCards(
        [FromQuery] int? deckId,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await freeStudyService.GetCardsAsync(userId.Value, deckId, cancellationToken));
    }

    [HttpPut("cards/{cardId:int}/mark")]
    public async Task<IActionResult> Mark(
        int cardId,
        MarkFreeStudyDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        if (request.Knows is not bool knows)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Knows is required.",
                Status = StatusCodes.Status400BadRequest
            });
        }

        var result = await freeStudyService.MarkAsync(userId.Value, cardId, knows, cancellationToken);
        if (result.ErrorStatus is null)
        {
            return NoContent();
        }

        return StatusCode(
            result.ErrorStatus.Value,
            new ProblemDetails
            {
                Title = result.ErrorTitle,
                Status = result.ErrorStatus
            });
    }

    [HttpDelete("marks")]
    public async Task<IActionResult> ClearMarks(
        [FromQuery] int? deckId,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await freeStudyService.ClearMarksAsync(userId.Value, deckId, cancellationToken);
        if (result.ErrorStatus is null)
        {
            return NoContent();
        }

        return StatusCode(
            result.ErrorStatus.Value,
            new ProblemDetails
            {
                Title = result.ErrorTitle,
                Status = result.ErrorStatus
            });
    }

    private ActionResult<T> ToActionResult<T>(DeckCardResult<T> result)
    {
        if (result.ErrorStatus is null && result.Value is not null)
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

    private int? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(sub, out var userId) ? userId : null;
    }
}
