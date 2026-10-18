using VocabApp.Api.DTOs;

namespace VocabApp.Api.Services;

public interface ICompositionService
{
    Task<int> RecordAttemptAsync(
        int userId,
        CompositionCheckResponseDto result,
        CancellationToken cancellationToken = default);

    Task<bool> AcceptAttemptAsync(int userId, int attemptId, CancellationToken cancellationToken = default);
}
