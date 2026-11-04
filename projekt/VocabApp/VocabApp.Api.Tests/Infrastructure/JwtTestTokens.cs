using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VocabApp.Api.Models;
using VocabApp.Api.Services;

namespace VocabApp.Api.Tests.Infrastructure;

/// <summary>Kézzel kiállított tokenek: a hitelesítés szélső eseteihez, és ott, ahol a regisztráció sebességkorlátja útban lenne.</summary>
public static class JwtTestTokens
{
    public const string Key = "VocabApp-Test-Jwt-Signing-Key-For-Unit-Tests-Only";

    public static string Create(
        int? sub,
        int? tokenVersion = 0,
        string issuer = "VocabApp",
        string audience = "VocabApp",
        DateTime? expires = null,
        string key = Key,
        string? rawSub = null)
    {
        var claims = new List<Claim> { new(JwtRegisteredClaimNames.Sub, rawSub ?? sub!.Value.ToString()) };
        if (tokenVersion is not null)
        {
            claims.Add(new Claim(AuthService.TokenVersionClaim, tokenVersion.Value.ToString()));
        }

        var expiry = expires ?? DateTime.UtcNow.AddDays(1);
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(issuer, audience, claims, notBefore: new[] { DateTime.UtcNow.AddHours(-1), expiry.AddHours(-2) }.Min(), expires: expiry, signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    /// <summary>Felhasználó közvetlenül az adatbázisba, a /register végpont (és a sebességkorlátja) megkerülésével.</summary>
    public static async Task<TestUser> CreateUserDirectlyAsync(ApiFactory factory)
    {
        var id = Guid.NewGuid().ToString("N")[..14];
        var user = new User { Email = $"direct{id}@test.local", Username = $"d{id}" };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, ApiFactory.Password);
        user.Decks.Add(new Deck { Name = "Saját pakli" });
        await factory.WithDbAsync(async db =>
        {
            db.Users.Add(user);
            await db.SaveChangesAsync();
        });

        var token = Create(user.Id);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return new TestUser { Client = client, Email = user.Email, Username = user.Username, Password = ApiFactory.Password, Token = token };
    }
}
