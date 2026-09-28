using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IAiService
{
    Task<GenerateDefinitionResponseDto> GenerateDefinitionAsync(
        GenerateDefinitionRequestDto request,
        CancellationToken cancellationToken = default);

    Task<GenerateExampleResponseDto?> GenerateExampleAsync(
        int userId,
        GenerateExampleRequestDto request,
        CancellationToken cancellationToken = default);

    Task<GenerateTargetMeaningResponseDto> GenerateTargetMeaningAsync(
        GenerateTargetMeaningRequestDto request,
        CancellationToken cancellationToken = default);

    Task<ValidateAnswerResponseDto> ValidateAnswerAsync(
        ValidateAnswerRequestDto request,
        CancellationToken cancellationToken = default);
}
