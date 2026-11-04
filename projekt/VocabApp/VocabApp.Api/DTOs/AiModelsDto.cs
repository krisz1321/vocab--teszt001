namespace VocabApp.Api.DTOs;

public sealed class AiModelsDto
{
    public string Default { get; set; } = string.Empty;
    public List<AiModelDto> Models { get; set; } = [];
}

public sealed class AiModelDto
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}
