using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IAiService
{
    Task<GenerateDefinitionResponseDto?> GenerateDefinitionAsync(
        int userId,
        GenerateDefinitionRequestDto request,
        CancellationToken cancellationToken = default);

    Task<GenerateCardDefinitionResponseDto?> GenerateCardDefinitionAsync(
        int userId,
        GenerateCardDefinitionRequestDto request,
        CancellationToken cancellationToken = default);

    Task<GenerateExtraDefinitionResponseDto?> GenerateExtraDefinitionAsync(
        int userId,
        GenerateExtraDefinitionRequestDto request,
        CancellationToken cancellationToken = default);

    Task<GenerateExampleResponseDto?> GenerateExampleAsync(
        int userId,
        GenerateExampleRequestDto request,
        CancellationToken cancellationToken = default);

    Task<GenerateTargetMeaningResponseDto> GenerateTargetMeaningAsync(
        int userId,
        GenerateTargetMeaningRequestDto request,
        CancellationToken cancellationToken = default);

    Task<ValidateAnswerResponseDto> ValidateAnswerAsync(
        int userId,
        ValidateAnswerRequestDto request,
        CancellationToken cancellationToken = default);

    Task<RecognizeAmbiguityResponseDto?> RecognizeAmbiguityAsync(
        int userId,
        RecognizeAmbiguityRequestDto request,
        CancellationToken cancellationToken = default);
}
