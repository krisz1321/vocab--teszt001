namespace VocabApp.Api.Models;

public static class AvatarLimits
{
    public const int MaxBytes = 1024 * 1024;

    /// <summary>A multipart burkoló (határoló, fejlécek) számára hagyott ráhagyás a kérés méretkorlátjában.</summary>
    public const int MultipartOverheadBytes = 64 * 1024;

    public const int MaxRequestBytes = MaxBytes + MultipartOverheadBytes;
}
