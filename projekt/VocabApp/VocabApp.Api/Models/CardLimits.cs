namespace VocabApp.Api.Models;

/// <summary>A kártya szöveges mezőinek hosszkorlátai (a DTO-k, az entitások és az MI-ellenőrzés közös forrása).</summary>
public static class CardLimits
{
    public const int MaxTermLength = 100;
    public const int MaxDefinitionLength = 500;
    public const int MaxExampleLength = 500;
    public const int MaxTargetMeaningsLength = 300;
}
