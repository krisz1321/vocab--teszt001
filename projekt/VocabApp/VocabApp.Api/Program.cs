
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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

        // Kapcsoló: a RateLimiting:Enabled értéke true esetén aktív a sebességkorlátozás (alapból ki van kapcsolva).
        var rateLimitingEnabled = builder.Configuration.GetValue<bool>("RateLimiting:Enabled");
        if (rateLimitingEnabled)
        {
            builder.Services.AddRateLimiter(options =>
            {
                options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
                options.OnRejected = async (context, cancellationToken) =>
                {
                    context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                    await context.HttpContext.Response.WriteAsJsonAsync(
                        new ProblemDetails
                        {
                            Title = "Túl sok kérés érkezett. Kérlek, várj egy kicsit, majd próbáld újra.",
                            Status = StatusCodes.Status429TooManyRequests
                        },
                        cancellationToken);
                };

                // Belépés, regisztráció és jelszócsere: IP-nként percenként legfeljebb 20 kérés.
                options.AddPolicy("auth", httpContext => RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 20,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

                // Regisztráció közbeni foglaltság-ellenőrzés (gépelés közben, késleltetve): IP-nként percenként legfeljebb 60 kérés.
                options.AddPolicy("availability", httpContext => RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 60,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));

                // MI-hívások: felhasználónként percenként legfeljebb 40 kérés, mert minden hívás költséggel jár.
                options.AddPolicy("ai", httpContext => RateLimitPartition.GetFixedWindowLimiter(
                    httpContext.User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                        ?? httpContext.Connection.RemoteIpAddress?.ToString()
                        ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 40,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));
            });
        }

        builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
        builder.Services.AddScoped<IAuthService, AuthService>();
        builder.Services.AddScoped<IDeckService, DeckService>();
        builder.Services.AddScoped<ICardService, CardService>();
        builder.Services.AddSingleton<StudyAnswerToken>();
        builder.Services.AddScoped<AiFillUsage>();
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
            await SharedDeckSnapshot.BackfillHashesAsync(dbContext);
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
        if (rateLimitingEnabled)
        {
            app.UseRateLimiter();
        }

        app.MapControllers();

        await app.RunAsync();
    }
}
