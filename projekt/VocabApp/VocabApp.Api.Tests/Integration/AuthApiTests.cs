using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using VocabApp.Api.DTOs;
using VocabApp.Api.Tests.Infrastructure;

namespace VocabApp.Api.Tests.Integration;

[Collection(ApiCollection.Name)]
public class AuthApiTests(ApiFactory factory)
{
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4];
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4];

    private static string Unique() => Guid.NewGuid().ToString("N")[..12];

    private Task<HttpResponseMessage> RegisterRaw(string? email, string? username, string? password) =>
        factory.CreateAnonymousClient().PostAsJsonAsync(
            "/api/auth/register",
            new RegisterDto { Email = email, Username = username, Password = password });

    // ---- regisztráció ----

    [Fact]
    public async Task Register_Valid_ReturnsTokenAndCreatesDefaultDeck()
    {
        var id = Unique();
        var response = await RegisterRaw($"New.{id}@Test.Local", $"n{id}", "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var auth = await response.ReadAsync<AuthResponseDto>();
        Assert.False(string.IsNullOrEmpty(auth.Token));
        Assert.Equal($"new.{id}@test.local", auth.Email);

        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        var decks = await (await client.GetAsync("/api/decks")).ReadAsync<List<DeckDto>>();
        Assert.Equal("Saját pakli", Assert.Single(decks).Name);
    }

    [Theory]
    [InlineData(null, "validname", "Passw0rd1", "Az email megadása kötelező.")]
    [InlineData("", "validname", "Passw0rd1", "Az email megadása kötelező.")]
    [InlineData("   ", "validname", "Passw0rd1", "Az email megadása kötelező.")]
    [InlineData("not-an-email", "validname", "Passw0rd1", "Az email cím formátuma érvénytelen.")]
    [InlineData("a@b.hu", "validname", "short1", "A jelszónak legalább 8 karakter hosszúnak kell lennie.")]
    [InlineData("a@b.hu", "validname", null, "A jelszónak legalább 8 karakter hosszúnak kell lennie.")]
    [InlineData("a@b.hu", "validname", "onlyletters", "A jelszónak tartalmaznia kell legalább egy betűt és egy számot.")]
    [InlineData("a@b.hu", "validname", "12345678", "A jelszónak tartalmaznia kell legalább egy betűt és egy számot.")]
    [InlineData("a1b2c3d4@b.hu", "validname", "a1b2c3d4@b.hu", "A jelszó nem lehet azonos az email címmel.")]
    public async Task Register_InvalidInput_Returns400WithHungarianMessage(string? email, string? username, string? password, string expectedTitle)
    {
        // A mezők ellenőrzése megelőzi a foglaltság vizsgálatát, ezért nem kell egyedi értéket használni.
        var response = await RegisterRaw(email, username, password);

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal(expectedTitle, await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Register_EmailLongerThan256_Returns400()
    {
        var email = new string('a', 252) + "@b.hu"; // 257 karakter

        var response = await RegisterRaw(email, $"u{Unique()}", "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Az email cím legfeljebb 256 karakter lehet.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Register_EmailOfExactly256Characters_PassesTheLengthCheck()
    {
        var email = new string('a', 251) + "@b.hu"; // 256 karakter

        var response = await RegisterRaw(email, $"u{Unique()}", "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("ab")]
    [InlineData("has space")]
    [InlineData("ékezetes")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Register_InvalidUsername_Returns400(string? username)
    {
        var response = await RegisterRaw($"{Unique()}@test.local", username, "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Register_DuplicateEmail_Returns409CaseInsensitively()
    {
        var existing = await factory.RegisterUserAsync();

        var response = await RegisterRaw(existing.Email.ToUpperInvariant(), $"x{Unique()}", "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.Conflict);
        Assert.Equal("Ez az email cím már regisztrálva van.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Register_DuplicateUsername_Returns409()
    {
        var existing = await factory.RegisterUserAsync();

        var response = await RegisterRaw($"{Unique()}@test.local", existing.Username, "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.Conflict);
        Assert.Equal("Ez a felhasználónév már foglalt.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Register_TrimsUsername()
    {
        var name = $"t{Unique()}";
        var response = await RegisterRaw($"{Unique()}@test.local", $"  {name}  ", "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var availability = await (await factory.CreateClient().GetAsync($"/api/auth/availability?username={name}"))
            .ReadAsync<AvailabilityDto>();
        Assert.True(availability.UsernameTaken);
    }

    // ---- belépés ----

    [Fact]
    public async Task Login_ValidCredentials_ReturnsToken()
    {
        var user = await factory.RegisterUserAsync();

        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/login",
            new LoginDto { Email = user.Email, Password = user.Password });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        Assert.False(string.IsNullOrEmpty((await response.ReadAsync<AuthResponseDto>()).Token));
    }

    [Fact]
    public async Task Login_EmailIsCaseInsensitiveAndTrimmed()
    {
        var user = await factory.RegisterUserAsync();

        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/login",
            new LoginDto { Email = $"  {user.Email.ToUpperInvariant()} ", Password = user.Password });

        await response.AssertStatusAsync(HttpStatusCode.OK);
    }

    [Theory]
    [InlineData("wrong")]
    [InlineData("")]
    [InlineData(null)]
    public async Task Login_WrongOrMissingPassword_Returns401(string? password)
    {
        var user = await factory.RegisterUserAsync();

        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/login",
            new LoginDto { Email = user.Email, Password = password });

        await response.AssertStatusAsync(HttpStatusCode.Unauthorized);
        Assert.Equal("Hibás email vagy jelszó.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Login_UnknownEmail_Returns401WithTheSameMessage()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/login",
            new LoginDto { Email = $"{Unique()}@nowhere.local", Password = "Passw0rd1" });

        await response.AssertStatusAsync(HttpStatusCode.Unauthorized);
        Assert.Equal("Hibás email vagy jelszó.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Login_DemoAccountsAreSeeded()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/login",
            new LoginDto { Email = "demo@vocab.local", Password = "DemoUser1" });

        await response.AssertStatusAsync(HttpStatusCode.OK);
    }

    // ---- foglaltság ----

    [Fact]
    public async Task Availability_ReportsTakenAndFreeValues()
    {
        var user = await factory.RegisterUserAsync();
        var client = factory.CreateAnonymousClient();

        var taken = await (await client.GetAsync($"/api/auth/availability?email={user.Email}&username={user.Username}"))
            .ReadAsync<AvailabilityDto>();
        var free = await (await client.GetAsync($"/api/auth/availability?email={Unique()}@free.local&username=f{Unique()}"))
            .ReadAsync<AvailabilityDto>();

        Assert.True(taken.EmailTaken);
        Assert.True(taken.UsernameTaken);
        Assert.False(free.EmailTaken);
        Assert.False(free.UsernameTaken);
    }

    [Fact]
    public async Task Availability_EmptyInput_ReturnsNulls()
    {
        var result = await (await factory.CreateAnonymousClient().GetAsync("/api/auth/availability"))
            .ReadAsync<AvailabilityDto>();

        Assert.Null(result.EmailTaken);
        Assert.Null(result.UsernameTaken);
    }

    // ---- profil ----

    [Fact]
    public async Task Profile_ReturnsOwnData()
    {
        var user = await factory.RegisterUserAsync();

        var profile = await user.GetAsync<ProfileDto>("/api/auth/profile");

        Assert.Equal(user.Email, profile.Email);
        Assert.Equal(user.Username, profile.Username);
        Assert.Null(profile.DisplayName);
        Assert.False(profile.HasAvatar);
        Assert.Equal(0, profile.StudyDayStreak);
    }

    [Fact]
    public async Task UpdateDisplayName_SavesTrimmedAndBlankClears()
    {
        var user = await factory.RegisterUserAsync();

        (await user.PutJsonAsync("/api/auth/profile", new UpdateProfileDto { DisplayName = "  Kovács Anna " }))
            .EnsureSuccessStatusCode();
        Assert.Equal("Kovács Anna", (await user.GetAsync<ProfileDto>("/api/auth/profile")).DisplayName);

        (await user.PutJsonAsync("/api/auth/profile", new UpdateProfileDto { DisplayName = "   " }))
            .EnsureSuccessStatusCode();
        Assert.Null((await user.GetAsync<ProfileDto>("/api/auth/profile")).DisplayName);
    }

    [Fact]
    public async Task UpdateDisplayName_Boundary80()
    {
        var user = await factory.RegisterUserAsync();

        var ok = await user.PutJsonAsync("/api/auth/profile", new UpdateProfileDto { DisplayName = new string('a', 80) });
        var tooLong = await user.PutJsonAsync("/api/auth/profile", new UpdateProfileDto { DisplayName = new string('a', 81) });

        await ok.AssertStatusAsync(HttpStatusCode.NoContent);
        await tooLong.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task UpdateUsername_ChangesAndFreesTheOldName()
    {
        var user = await factory.RegisterUserAsync();
        var oldName = user.Username;
        var newName = $"n{Unique()}";

        (await user.PutJsonAsync("/api/auth/profile/username", new UpdateUsernameDto { Username = newName }))
            .EnsureSuccessStatusCode();

        Assert.Equal(newName, (await user.GetAsync<ProfileDto>("/api/auth/profile")).Username);
        var availability = await (await factory.CreateClient().GetAsync($"/api/auth/availability?username={oldName}"))
            .ReadAsync<AvailabilityDto>();
        Assert.False(availability.UsernameTaken);
    }

    [Fact]
    public async Task UpdateUsername_SameNameAsOwn_IsAllowed()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync("/api/auth/profile/username", new UpdateUsernameDto { Username = user.Username });

        await response.AssertStatusAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task UpdateUsername_TakenByAnother_Returns409()
    {
        var first = await factory.RegisterUserAsync();
        var second = await factory.RegisterUserAsync();

        var response = await second.PutJsonAsync("/api/auth/profile/username", new UpdateUsernameDto { Username = first.Username });

        await response.AssertStatusAsync(HttpStatusCode.Conflict);
    }

    [Theory]
    [InlineData("x")]
    [InlineData("bad name")]
    [InlineData(null)]
    public async Task UpdateUsername_Invalid_Returns400(string? username)
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync("/api/auth/profile/username", new UpdateUsernameDto { Username = username });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    // ---- jelszócsere ----

    [Fact]
    public async Task ChangePassword_Valid_ReturnsNewTokenAndInvalidatesTheOldOne()
    {
        var user = await factory.RegisterUserAsync();
        var oldToken = user.Token;

        var response = await user.PutJsonAsync(
            "/api/auth/password",
            new ChangePasswordDto { CurrentPassword = user.Password, NewPassword = "NewPassw0rd" });

        await response.AssertStatusAsync(HttpStatusCode.OK);
        var auth = await response.ReadAsync<AuthResponseDto>();
        Assert.NotEqual(oldToken, auth.Token);

        // a régi token már nem érvényes
        var stale = factory.CreateClient();
        stale.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", oldToken);
        await (await stale.GetAsync("/api/auth/profile")).AssertStatusAsync(HttpStatusCode.Unauthorized);

        // az új token érvényes
        var fresh = factory.CreateClient();
        fresh.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
        await (await fresh.GetAsync("/api/auth/profile")).AssertStatusAsync(HttpStatusCode.OK);

        // az új jelszóval be lehet lépni, a régivel nem
        var login = factory.CreateClient();
        await (await login.PostAsJsonAsync("/api/auth/login", new LoginDto { Email = user.Email, Password = "NewPassw0rd" }))
            .AssertStatusAsync(HttpStatusCode.OK);
        await (await login.PostAsJsonAsync("/api/auth/login", new LoginDto { Email = user.Email, Password = user.Password }))
            .AssertStatusAsync(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ChangePassword_WrongCurrentPassword_Returns400()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync(
            "/api/auth/password",
            new ChangePasswordDto { CurrentPassword = "Wrong1234", NewPassword = "NewPassw0rd" });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Hibás jelszó.", await response.ProblemTitleAsync());
    }

    [Theory]
    [InlineData("short1")]
    [InlineData("onlyletters")]
    [InlineData("12345678")]
    [InlineData(null)]
    public async Task ChangePassword_WeakNewPassword_Returns400(string? newPassword)
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.PutJsonAsync(
            "/api/auth/password",
            new ChangePasswordDto { CurrentPassword = user.Password, NewPassword = newPassword });

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    // ---- avatar ----

    private static MultipartFormDataContent FileContent(byte[] bytes, string contentType = "image/png", string name = "a.png")
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", name } };
    }

    [Fact]
    public async Task Avatar_UploadServeAndDelete()
    {
        var user = await factory.RegisterUserAsync();

        await (await user.Client.PutAsync("/api/auth/avatar", FileContent(Png))).AssertStatusAsync(HttpStatusCode.NoContent);
        Assert.True((await user.GetAsync<ProfileDto>("/api/auth/profile")).HasAvatar);

        // az avatar névtelenül is elérhető, a tartalom egyezik
        var served = await factory.CreateAnonymousClient().GetAsync($"/api/auth/avatar/{user.Id}");
        await served.AssertStatusAsync(HttpStatusCode.OK);
        Assert.Equal("image/png", served.Content.Headers.ContentType?.MediaType);
        Assert.Equal(Png, await served.Content.ReadAsByteArrayAsync());

        await (await user.Client.DeleteAsync("/api/auth/avatar")).AssertStatusAsync(HttpStatusCode.NoContent);
        Assert.False((await user.GetAsync<ProfileDto>("/api/auth/profile")).HasAvatar);
        await (await factory.CreateAnonymousClient().GetAsync($"/api/auth/avatar/{user.Id}"))
            .AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Avatar_TypeComesFromTheBytesNotFromTheContentType()
    {
        var user = await factory.RegisterUserAsync();

        // JPEG-tartalom hamis "image/png" fejléccel
        await (await user.Client.PutAsync("/api/auth/avatar", FileContent(Jpeg, "image/png", "x.png")))
            .AssertStatusAsync(HttpStatusCode.NoContent);

        var served = await factory.CreateAnonymousClient().GetAsync($"/api/auth/avatar/{user.Id}");
        Assert.Equal("image/jpeg", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Avatar_ReplacingWithAnotherTypeRemovesTheOldFile()
    {
        var user = await factory.RegisterUserAsync();
        await user.Client.PutAsync("/api/auth/avatar", FileContent(Png));

        await user.Client.PutAsync("/api/auth/avatar", FileContent(Jpeg, "image/jpeg", "a.jpg"));

        var served = await factory.CreateAnonymousClient().GetAsync($"/api/auth/avatar/{user.Id}");
        Assert.Equal("image/jpeg", served.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Avatar_WebpIsAccepted()
    {
        var user = await factory.RegisterUserAsync();
        byte[] webp = [.. "RIFF"u8, 0, 0, 0, 0, .. "WEBP"u8, 1, 2];

        await (await user.Client.PutAsync("/api/auth/avatar", FileContent(webp, "image/webp", "a.webp")))
            .AssertStatusAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Avatar_NotAnImage_Returns400()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.Client.PutAsync("/api/auth/avatar", FileContent("hello world"u8.ToArray(), "image/png"));

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
        Assert.Equal("Csak JPEG, PNG vagy WebP kép tölthető fel, legfeljebb 1 MB.", await response.ProblemTitleAsync());
    }

    [Fact]
    public async Task Avatar_EmptyFile_Returns400()
    {
        var user = await factory.RegisterUserAsync();

        var response = await user.Client.PutAsync("/api/auth/avatar", FileContent([]));

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Avatar_LargerThanOneMegabyte_Returns400()
    {
        var user = await factory.RegisterUserAsync();
        var big = new byte[1024 * 1024 + 10];
        Png.CopyTo(big, 0);

        var response = await user.Client.PutAsync("/api/auth/avatar", FileContent(big));

        await response.AssertStatusAsync(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Avatar_ExactlyOneMegabyte_IsAccepted()
    {
        var user = await factory.RegisterUserAsync();
        var exact = new byte[1024 * 1024];
        Png.CopyTo(exact, 0);

        var response = await user.Client.PutAsync("/api/auth/avatar", FileContent(exact));

        await response.AssertStatusAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Avatar_UnknownUser_Returns404()
    {
        await (await factory.CreateAnonymousClient().GetAsync("/api/auth/avatar/99999999"))
            .AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Avatar_UploadRequiresLogin()
    {
        var response = await factory.CreateAnonymousClient().PutAsync("/api/auth/avatar", FileContent(Png));

        await response.AssertStatusAsync(HttpStatusCode.Unauthorized);
    }

    // ---- fiók törlése ----

    [Fact]
    public async Task DeleteAccount_RemovesUserAndInvalidatesTheToken()
    {
        var user = await factory.RegisterUserAsync();
        var deck = await user.CreateDeckAsync();
        await user.CreateCardAsync(deck.Id, "farewell");
        await user.Client.PutAsync("/api/auth/avatar", FileContent(Png));

        await (await user.Client.DeleteAsync("/api/auth/account")).AssertStatusAsync(HttpStatusCode.NoContent);

        await (await user.Client.GetAsync("/api/auth/profile")).AssertStatusAsync(HttpStatusCode.Unauthorized);
        await (await factory.CreateClient().PostAsJsonAsync(
            "/api/auth/login",
            new LoginDto { Email = user.Email, Password = user.Password })).AssertStatusAsync(HttpStatusCode.Unauthorized);
        await (await factory.CreateAnonymousClient().GetAsync($"/api/auth/avatar/{user.Id}"))
            .AssertStatusAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteAccount_FreesEmailAndUsername()
    {
        var user = await factory.RegisterUserAsync();
        await user.Client.DeleteAsync("/api/auth/account");

        var response = await RegisterRaw(user.Email, user.Username, "Passw0rd1");

        await response.AssertStatusAsync(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DeleteAccount_WithSharedDeckAndCopies_DoesNotBreakOthers()
    {
        var owner = await factory.RegisterUserAsync();
        var deck = await owner.CreateDeckAsync();
        await owner.CreateCardAsync(deck.Id, "shared-word");
        (await owner.PutJsonAsync($"/api/decks/{deck.Id}/share", new ShareDeckDto { IsPublic = true })).EnsureSuccessStatusCode();
        var reader = await factory.RegisterUserAsync();
        var publicDeck = (await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString(deck.Name)}")).Single();
        (await reader.Client.PostAsync($"/api/decks/public/{publicDeck.Id}/copy", null)).EnsureSuccessStatusCode();

        await (await owner.Client.DeleteAsync("/api/auth/account")).AssertStatusAsync(HttpStatusCode.NoContent);

        // a másolat megmarad, de már nincs hozzá élő forrás
        var copy = (await reader.GetAsync<List<DeckDto>>("/api/decks")).Single(d => d.Name == deck.Name);
        Assert.Equal(1, copy.CardCount);
        Assert.Null(copy.SourceSharedDeckId);
        Assert.Empty(await reader.GetAsync<List<PublicDeckDto>>($"/api/decks/public?q={Uri.EscapeDataString(deck.Name)}"));
    }

    // ---- hitelesítés általában ----

    [Fact]
    public async Task Token_WithGarbage_Returns401()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not.a.jwt");

        await (await client.GetAsync("/api/auth/profile")).AssertStatusAsync(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Token_SignedWithAnotherKey_Returns401()
    {
        var user = await factory.RegisterUserAsync();
        var parts = user.Token.Split('.');
        var forged = $"{parts[0]}.{parts[1]}.{parts[2][..^2]}AA";
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", forged);

        await (await client.GetAsync("/api/auth/profile")).AssertStatusAsync(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Token_TwoUsersNeverSeeEachOthersProfile()
    {
        var first = await factory.RegisterUserAsync();
        var second = await factory.RegisterUserAsync();

        Assert.NotEqual(
            (await first.GetAsync<ProfileDto>("/api/auth/profile")).Email,
            (await second.GetAsync<ProfileDto>("/api/auth/profile")).Email);
    }
}
