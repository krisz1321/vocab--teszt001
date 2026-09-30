using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface IStudyService
{
    Task<StudyNextResult> GetNextCardAsync(
        int userId,
        int? deckId,
        string? focus,
        CancellationToken cancellationToken = default);
    Task<StudySubmitResult> SubmitAsync(int userId, StudySubmitDto request, CancellationToken cancellationToken = default);
    Task<StudyStatsDto> GetStatsAsync(int userId, CancellationToken cancellationToken = default);
    Task<StudySettingsDto?> GetSettingsAsync(int userId, CancellationToken cancellationToken = default);
    Task<StudySettingsResult> UpdateSettingsAsync(int userId, StudySettingsDto request, CancellationToken cancellationToken = default);
}
