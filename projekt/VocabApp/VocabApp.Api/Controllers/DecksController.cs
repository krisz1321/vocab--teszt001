using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/decks")]
public sealed class DecksController(IDeckService deckService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<DeckDto>>> Get(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return Ok(await deckService.GetAsync(userId.Value, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<DeckDto>> Create(CreateDeckDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await deckService.CreateAsync(userId.Value, request, cancellationToken));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<DeckDto>> Rename(int id, RenameDeckDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await deckService.RenameAsync(userId.Value, id, request, cancellationToken));
    }

    [HttpPut("{id:int}/share")]
    public async Task<ActionResult<DeckDto>> Share(int id, ShareDeckDto request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await deckService.ShareAsync(userId.Value, id, request, cancellationToken));
    }

    [HttpGet("public")]
    public async Task<ActionResult<IReadOnlyList<PublicDeckDto>>> GetPublic(
        [FromQuery] string? q,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return Ok(await deckService.GetPublicAsync(userId.Value, q, cancellationToken));
    }

    [HttpPost("{id:int}/copy")]
    public async Task<ActionResult<DeckDto>> Copy(int id, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        return ToActionResult(await deckService.CopyAsync(userId.Value, id, cancellationToken));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var deleted = await deckService.DeleteAsync(userId.Value, id, cancellationToken);
        return deleted
            ? NoContent()
            : NotFound(new ProblemDetails { Title = "Deck not found", Status = StatusCodes.Status404NotFound });
    }

    [HttpGet("{id:int}/export")]
    public async Task<IActionResult> Export(int id, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var result = await deckService.ExportAsync(userId.Value, id, cancellationToken);
        if (result.Value is null)
        {
            return StatusCode(
                result.ErrorStatus ?? StatusCodes.Status500InternalServerError,
                new ProblemDetails
                {
                    Title = result.ErrorTitle,
                    Status = result.ErrorStatus
                });
        }

        return File(Encoding.UTF8.GetBytes(result.Value.Content), "text/csv; charset=utf-8", result.Value.FileName);
    }

    [HttpPost("{id:int}/import")]
    [Consumes("text/csv")]
    public async Task<ActionResult<ImportDeckResultDto>> Import(int id, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var csv = await reader.ReadToEndAsync(cancellationToken);
        var result = await deckService.ImportAsync(userId.Value, id, csv, cancellationToken);
        if (result.Value is null)
        {
            return StatusCode(
                result.ErrorStatus ?? StatusCodes.Status500InternalServerError,
                new ProblemDetails
                {
                    Title = result.ErrorTitle,
                    Status = result.ErrorStatus
                });
        }

        return Ok(result.Value);
    }

    private ActionResult<DeckDto> ToActionResult(DeckCardResult<DeckDto> result)
    {
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

    private int? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(sub, out var userId) ? userId : null;
    }
}
