using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/grammar")]
public sealed class GrammarController(IGrammarService grammarService) : ControllerBase
{
    [HttpGet("tenses")]
    public async Task<ActionResult<GrammarTensesDto>> GetTenses(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await grammarService.GetTensesAsync(userId.Value, cancellationToken));
    }

    [HttpPut("tenses")]
    public async Task<ActionResult<GrammarTensesDto>> SetTenses(
        GrammarTensesDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await grammarService.SetTensesAsync(userId.Value, request.Tenses, cancellationToken));
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
