
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VocabApp.Api.Data;
using VocabApp.Api.Models;
using VocabApp.Api.Services;

namespace VocabApp.Api;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers().ConfigureApiBehaviorOptions(options =>
        {
            // A beépített validációs hibák címe magyar legyen, mert a felület ezt a címet jeleníti meg.
            options.InvalidModelStateResponseFactory = context => new BadRequestObjectResult(
                new ValidationProblemDetails(context.ModelState)
                {
                    Title = "A megadott adatok hiányosak vagy érvénytelenek.",
                    Status = StatusCodes.Status400BadRequest
                })
            {
                ContentTypes = { "application/problem+json" }
            };
        });
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();

        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required.");
        builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("Frontend", policy =>
                policy.WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
                    .AllowAnyMethod()
                    .AllowAnyHeader());
        });

        var jwtKey = builder.Configuration["Jwt:Key"];
        if (string.IsNullOrWhiteSpace(jwtKey))
        {
            throw new InvalidOperationException("Jwt:Key is required.");
        }

        var expiresDays = builder.Configuration.GetValue<int?>("Jwt:ExpiresDays");
        if (expiresDays is null or <= 0)
        {
            throw new InvalidOperationException("Jwt:ExpiresDays is required.");
        }

        var jwtIssuer = builder.Configuration["Jwt:Issuer"]
            ?? throw new InvalidOperationException("Jwt:Issuer is required.");
        var jwtAudience = builder.Configuration["Jwt:Audience"]
            ?? throw new InvalidOperationException("Jwt:Audience is required.");

        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtIssuer,
                    ValidAudience = jwtAudience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
                };
            });
        builder.Services.AddAuthorization();

        builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        builder.Services.AddScoped<IAuthService, AuthService>();
        builder.Services.AddScoped<IDeckService, DeckService>();
        builder.Services.AddScoped<ICardService, CardService>();
        builder.Services.AddSingleton<StudyAnswerToken>();
        builder.Services.AddScoped<IStudyService, StudyService>();
        builder.Services.AddScoped<IFreeStudyService, FreeStudyService>();
        builder.Services.AddHttpClient<IAiService, AiService>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(60);
        });

        var app = builder.Build();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await dbContext.Database.MigrateAsync();
            var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>();
            await BaseUserSeed.EnsureAsync(dbContext, passwordHasher);
        }

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }
        else
        {
            app.UseHttpsRedirection();
        }

        app.UseCors("Frontend");
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();

        await app.RunAsync();
    }
}
