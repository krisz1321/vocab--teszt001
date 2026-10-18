using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using VocabApp.Api.DTOs;
using VocabApp.Api.Models;
using VocabApp.Api.Services;

namespace VocabApp.Api.Controllers;

[Authorize]
[ApiController]
[EnableRateLimiting("ai")]
[Route("api/ai")]
public sealed class AiController(
    IAiService aiService,
    IGrammarService grammarService,
    ICompositionService compositionService) : ControllerBase
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
                    Title = "A kártya nem található.",
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
                    Title = "A pakli nem található.",
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
                    Title = "A kártya nem található.",
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
                    Title = "A kártya nem található.",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    // Az import előnézetének kötegelt kitöltése: a percenkénti "ai" limit helyett napi keret számolódik (lásd AiFillUsage).
    [HttpPost("generate/deck-fill")]
    [DisableRateLimiting]
    public async Task<ActionResult<GenerateDeckFillResponseDto>> GenerateDeckFill(
        GenerateDeckFillRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = true;
        foreach (var item in request.Items)
        {
            isValid &= RequireText(item.Term, nameof(item.Term));
        }

        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateDeckFillAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "A pakli nem található.",
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
                    Title = "A kártya nem található.",
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
                    Title = "Az indoklás megadása kötelező."
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

    // Nyelvtan nézet: az ellenőrzött mondat eredménye a szerveren mentődik (GrammarAttempt), az SM-2-be nem számít.
    [HttpPost("grammar/check")]
    public async Task<ActionResult<GrammarCheckResponseDto>> CheckGrammar(
        GrammarCheckRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Sentence, nameof(request.Sentence));
        isValid &= RequireTense(request.Tense, nameof(request.Tense));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.CheckGrammarSentenceAsync(userId.Value, request, cancellationToken);
            if (result is null)
            {
                return NotFound(new ProblemDetails
                {
                    Title = "A kártya nem található.",
                    Status = StatusCodes.Status404NotFound
                });
            }

            result.AttemptId = await grammarService.RecordAttemptAsync(userId.Value, request.CardId, request.Tense, result, cancellationToken);
            return Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("grammar/example")]
    public async Task<ActionResult<GrammarExampleResponseDto>> GenerateGrammarExample(
        GrammarExampleRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        if (!RequireTense(request.Tense, nameof(request.Tense)))
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateGrammarExampleAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "A kártya nem található.",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("grammar/hint")]
    public async Task<ActionResult<GrammarHintResponseDto>> GenerateGrammarHint(
        GrammarHintRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        if (!RequireTense(request.Tense, nameof(request.Tense)))
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateGrammarHintAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "A kártya nem található.",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    // Mondatok nézet: az ellenőrzött szöveg eredménye a szerveren mentődik (CompositionAttempt), az SM-2-be nem számít.
    [HttpPost("composition/check")]
    public async Task<ActionResult<CompositionCheckResponseDto>> CheckComposition(
        CompositionCheckRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var isValid = RequireText(request.Text, nameof(request.Text));
        isValid &= RequireCardIds(request.CardIds, nameof(request.CardIds));
        if (!isValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.CheckCompositionAsync(userId.Value, request, cancellationToken);
            if (result is null)
            {
                return NotFound(new ProblemDetails
                {
                    Title = "A kártya nem található.",
                    Status = StatusCodes.Status404NotFound
                });
            }

            result.AttemptId = await compositionService.RecordAttemptAsync(userId.Value, result, cancellationToken);
            return Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("composition/example")]
    public async Task<ActionResult<CompositionExampleResponseDto>> GenerateCompositionExample(
        CompositionCardsRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        if (!RequireCardIds(request.CardIds, nameof(request.CardIds)))
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateCompositionExampleAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "A kártya nem található.",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    [HttpPost("composition/hint")]
    public async Task<ActionResult<CompositionHintResponseDto>> GenerateCompositionHint(
        CompositionCardsRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        if (!RequireCardIds(request.CardIds, nameof(request.CardIds)))
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var result = await aiService.GenerateCompositionHintAsync(userId.Value, request, cancellationToken);
            return result is null
                ? NotFound(new ProblemDetails
                {
                    Title = "A kártya nem található.",
                    Status = StatusCodes.Status404NotFound
                })
                : Ok(result);
        }
        catch (AiServiceException exception)
        {
            return MapAiException(exception);
        }
    }

    // A darabszámot a DTO MinLength/MaxLength attribútuma ellenőrzi; itt az érvényes és különböző azonosítókat.
    private bool RequireCardIds(IReadOnlyCollection<int> cardIds, string propertyName)
    {
        if (cardIds.All(id => id > 0) && cardIds.Distinct().Count() == cardIds.Count)
        {
            return true;
        }

        ModelState.AddModelError(propertyName, "A szavaknak különböző, létező kártyáknak kell lenniük.");
        return false;
    }

    private bool RequireTense(string value, string propertyName)
    {
        if (GrammarTenses.IsAllowed(value))
        {
            return true;
        }

        ModelState.AddModelError(propertyName, "Ismeretlen igeidő.");
        return false;
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
                ModelState.AddModelError(nameof(ExplainAnswerRequestDto.Messages), "Minden üzenethez szerep (user vagy assistant) és szöveg kell.");
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
                (StatusCodes.Status503ServiceUnavailable, "Az MI-szolgáltatás jelenleg nem érhető el."),
            AiServiceErrorKind.Upstream =>
                (StatusCodes.Status502BadGateway, "Hiba történt az MI-szolgáltatónál."),
            AiServiceErrorKind.LimitReached =>
                (StatusCodes.Status429TooManyRequests, "Elérted a mai AI-kitöltési keretet."),
            _ =>
                (StatusCodes.Status502BadGateway, "Az MI érvénytelen választ adott.")
        };

        return StatusCode(status, new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = "Az MI-kérést nem sikerült teljesíteni."
        });
    }
}
