using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

// A Mondatok nézet nem MI-s végpontjai. A magyar jelentés kapcsolója közös a Nyelvtannal (api/grammar/translation).
[Authorize]
[ApiController]
[Route("api/composition")]
public sealed class CompositionController(ICompositionService compositionService) : ControllerBase
{
    [HttpPut("attempts/{attemptId:int}/accept")]
    public async Task<IActionResult> AcceptAttempt(int attemptId, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return await compositionService.AcceptAttemptAsync(userId.Value, attemptId, cancellationToken)
            ? NoContent()
            : NotFound(new ProblemDetails { Title = "Az eredmény nem található.", Status = StatusCodes.Status404NotFound });
    }

    private int? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(sub, out var userId) ? userId : null;
    }
}
