using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VocabApp.Api.DTOs;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/ai")]
public sealed class AiController(IAiService aiService) : ControllerBase
{
    [HttpPost("generate/definition")]
    public async Task<ActionResult<GenerateDefinitionResponseDto>> GenerateDefinition(
        GenerateDefinitionRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        if (!RequireText(request.Term, nameof(request.Term)))
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateDefinitionAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "Card not found",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("generate/card-definition")]
    public async Task<ActionResult<GenerateCardDefinitionResponseDto>> GenerateCardDefinition(
        GenerateCardDefinitionRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        if (!RequireText(request.Term, nameof(request.Term)))
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateCardDefinitionAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "Deck not found",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("generate/extra-definition")]
    public async Task<ActionResult<GenerateExtraDefinitionResponseDto>> GenerateExtraDefinition(
        GenerateExtraDefinitionRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Term, nameof(request.Term));
        isValid &= RequireText(request.AvoidDefinition, nameof(request.AvoidDefinition));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateExtraDefinitionAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "Card not found",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("generate/example")]
    public async Task<ActionResult<GenerateExampleResponseDto>> GenerateExample(
        GenerateExampleRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Term, nameof(request.Term));
        isValid &= RequireText(request.Definition, nameof(request.Definition));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateExampleAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "Card not found",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("generate/target-meaning")]
    public async Task<ActionResult<GenerateTargetMeaningResponseDto>> GenerateTargetMeaning(
        GenerateTargetMeaningRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Term, nameof(request.Term));
        isValid &= RequireText(request.Definition, nameof(request.Definition));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            return Ok(await aiService.GenerateTargetMeaningAsync(userId.Value, request, cancellationToken));
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("recognize-ambiguity")]
    public async Task<ActionResult<RecognizeAmbiguityResponseDto>> RecognizeAmbiguity(
        RecognizeAmbiguityRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Definition, nameof(request.Definition));
        isValid &= RequireText(request.Guess, nameof(request.Guess));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.RecognizeAmbiguityAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "Card not found",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("validate")]
    public async Task<ActionResult<ValidateAnswerResponseDto>> Validate(
        ValidateAnswerRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Term, nameof(request.Term));
        isValid &= RequireText(request.Definition, nameof(request.Definition));
        isValid &= RequireText(request.Answer, nameof(request.Answer));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            return Ok(await aiService.ValidateAnswerAsync(userId.Value, request, cancellationToken));
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("appeal-answer")]
    public async Task<ActionResult<AppealAnswerResponseDto>> AppealAnswer(
        AppealAnswerRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Term, nameof(request.Term));
        isValid &= RequireText(request.Definition, nameof(request.Definition));
        isValid &= RequireText(request.Answer, nameof(request.Answer));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.AppealAnswerAsync(userId.Value, request, cancellationToken);
            if (result is null)
            {
                return BadRequest(new ProblemDetails
                {
                    Status = StatusCodes.Status400BadRequest,
                    Title = "Appeal reason is required"
                });
            }

            return Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("explain-answer")]
    public async Task<ActionResult<ExplainAnswerResponseDto>> ExplainAnswer(
        ExplainAnswerRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Term, nameof(request.Term));
        isValid &= RequireText(request.Definition, nameof(request.Definition));
        isValid &= RequireText(request.Answer, nameof(request.Answer));
        isValid &= RequireMessages(request.Messages);
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            return Ok(await aiService.ExplainAnswerAsync(userId.Value, request, cancellationToken));
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    private int? GetUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return int.TryParse(sub, out var userId) ? userId : null;
    }

    private bool RequireText(string value, string propertyName)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        ModelState.AddModelError(propertyName, $"{propertyName} must not be empty or whitespace.");
        return false;
    }

    private bool RequireMessages(IReadOnlyList<ExplainMessageDto>? messages)
    {
        if (messages is null)
        {
            return true;
        }

        foreach (var message in messages)
        {
            var role = (message.Role ?? string.Empty).Trim().ToLowerInvariant();
            if (role is not ("user" or "assistant") || string.IsNullOrWhiteSpace(message.Content))
            {
                ModelState.AddModelError(nameof(ExplainAnswerRequestDto.Messages), "Each message needs a user or assistant role and text.");
                return false;
            }
        }

        return true;
    }

    private ActionResult MapAiException(AiServiceException exception)
    {
        var (status, title) = exception.Kind switch
        {
            AiServiceErrorKind.Configuration =>
                (StatusCodes.Status503ServiceUnavailable, "AI service unavailable"),
            AiServiceErrorKind.Upstream =>
                (StatusCodes.Status502BadGateway, "AI provider error"),
            _ =>
                (StatusCodes.Status502BadGateway, "Invalid AI response")
        };

        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = "The AI request could not be completed."
        });
    }
}
