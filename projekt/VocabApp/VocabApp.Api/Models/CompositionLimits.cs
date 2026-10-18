namespace VocabApp.Api.Models;

// A Mondatok nézet korlátai. A kliens composition.component.ts ugyanezeket használja.
public static class CompositionLimits
{
    public const int MinWords = 2;

    public const int MaxWords = 5;

    public const int MaxTextLength = 500;
}
