using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/cards")]
public sealed class CardsController(ICardService cardService) : ControllerBase
{
    [HttpGet("learned")]
    public async Task<ActionResult<IReadOnlyList<LearnedCardDto>>> GetLearned(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return Ok(await cardService.GetLearnedAsync(userId.Value, cancellationToken));
    }

    [HttpGet("by-deck/{deckId:int}")]
    public async Task<ActionResult<IReadOnlyList<CardDto>>> GetByDeck(int deckId, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await cardService.GetByDeckAsync(userId.Value, deckId, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<CardDto>> Create(CreateCardDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await cardService.CreateAsync(userId.Value, request, cancellationToken));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CardDto>> Update(int id, UpdateCardDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await cardService.UpdateAsync(userId.Value, id, request, cancellationToken));
    }

    [HttpPut("{id:int}/known")]
    public async Task<ActionResult<CardDto>> SetKnown(int id, SetCardKnownDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await cardService.SetKnownAsync(userId.Value, id, request.Known, cancellationToken));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var deleted = await cardService.DeleteAsync(userId.Value, id, cancellationToken);
        return deleted
            ? NoContent()
            : NotFound(new ProblemDetails { Title = "Card not found", Status = StatusCodes.Status404NotFound });
    }

    [HttpPost("{id:int}/reset-learned")]
    public async Task<IActionResult> ResetLearned(int id, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var reset = await cardService.ResetLearnedAsync(userId.Value, id, cancellationToken);
        return reset
            ? NoContent()
            : NotFound(new ProblemDetails { Title = "Card not found", Status = StatusCodes.Status404NotFound });
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
