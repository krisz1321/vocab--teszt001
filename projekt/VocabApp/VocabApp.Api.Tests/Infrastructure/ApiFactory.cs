using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VocabApp.Api.Data;
using VocabApp.Api.Services;

namespace VocabApp.Api.Tests.Infrastructure;

/// <summary>
/// A teljes API egy példánya a memóriában, saját (a teszt végén törölt) LocalDB-adatbázissal.
/// Az MI-szolgáltatás itt egy hamis <see cref="FakeAiService"/>; a fejlesztői <c>VocabApp</c> adatbázishoz és az
/// MI-kulcshoz nem nyúl.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>
{
    public const string Password = "Passw0rdTest";

    private const string ServerConnection = @"Server=(localdb)\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True";

    private readonly string databaseName = $"VocabApp_Test_{Guid.NewGuid():N}";
    private readonly string contentRoot = Path.Combine(Path.GetTempPath(), "vocabapp-tests-" + Guid.NewGuid().ToString("N"));
    private int sequence;

    public ApiFactory()
    {
        Directory.CreateDirectory(contentRoot);
    }

    public FakeAiService Ai { get; } = new();

    /// <summary>Ha igaz, a valódi <see cref="AiService"/> fut, a kimenő HTTP-hívásait pedig a <see cref="AiServer"/> kezeli.</summary>
    protected virtual bool UseRealAiService => false;

    public ScriptedAiServer AiServer { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        // Az avatarok a tartalomgyökér alá kerülnek: így nem a valódi App_Data mappába.
        builder.UseContentRoot(contentRoot);

        // A Program.cs a beállításokat a build elején olvassa, ezért host-beállításként adjuk át őket.
        builder.UseSetting("ConnectionStrings:DefaultConnection", $"{ServerConnection};Database={databaseName}");
        builder.UseSetting("Jwt:Key", "VocabApp-Test-Jwt-Signing-Key-For-Unit-Tests-Only");
        builder.UseSetting("Jwt:Issuer", "VocabApp");
        builder.UseSetting("Jwt:Audience", "VocabApp");
        builder.UseSetting("Jwt:ExpiresDays", "7");
        builder.UseSetting("AiSettings:ApiKey", UseRealAiService ? "test-key" : "");
        builder.UseSetting("AiSettings:Endpoint", "http://ai.test/v1/chat/completions");

        builder.ConfigureTestServices(services =>
        {
            if (UseRealAiService)
            {
                services.AddHttpClient<IAiService, AiService>().ConfigurePrimaryHttpMessageHandler(() => AiServer);
                return;
            }

            services.RemoveAll<IAiService>();
            services.AddSingleton<IAiService>(Ai);
        });
    }

    /// <summary>Új, egyedi felhasználó regisztrálása; a visszaadott kliens már be van jelentkezve.</summary>
    public async Task<TestUser> RegisterUserAsync(string password = Password)
    {
        var id = $"{Interlocked.Increment(ref sequence)}{Guid.NewGuid():N}"[..14];
        return await TestUser.RegisterAsync(this, $"user{id}@test.local", $"u{id}", password);
    }

    public HttpClient CreateAnonymousClient() => CreateClient();

    /// <summary>Futásidejű beállításváltás (pl. <c>AiFill:EnforceDailyLimit</c>); a hívó állítsa vissza.</summary>
    public IDisposable OverrideConfig(string key, string? value)
    {
        var configuration = Services.GetRequiredService<IConfiguration>();
        var previous = configuration[key];
        configuration[key] = value;
        return new Restore(() => configuration[key] = previous);
    }

    /// <summary>Közvetlen adatbázis-hozzáférés a teszt előkészítéséhez vagy ellenőrzéséhez (pl. az idő "előretekerése").</summary>
    public async Task WithDbAsync(Func<AppDbContext, Task> action)
    {
        using var scope = Services.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public async Task<T> WithDbAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    /// <summary>A kártyát esedékessé teszi (a tanulás csak az esedékes kártyát ajánlja újra).</summary>
    public Task MakeCardDueAsync(int cardId, TimeSpan? overdueBy = null)
    {
        var dueDate = DateTime.UtcNow - (overdueBy ?? TimeSpan.FromHours(1));
        return WithDbAsync(db => db.CardProgresses
            .Where(progress => progress.CardId == cardId)
            .ExecuteUpdateAsync(set => set.SetProperty(progress => progress.NextReviewDate, dueDate)));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing)
        {
            return;
        }

        try
        {
            using var connection = new SqlConnection(ServerConnection);
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText =
                $"IF DB_ID(N'{databaseName}') IS NOT NULL BEGIN " +
                $"ALTER DATABASE [{databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{databaseName}]; END";
            command.ExecuteNonQuery();
        }
        catch (SqlException)
        {
            // A takarítás hibája ne buktassa meg a tesztfutást.
        }

        try
        {
            Directory.Delete(contentRoot, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    private sealed class Restore(Action restore) : IDisposable
    {
        public void Dispose() => restore();
    }
}

/// <summary>Ugyanaz, de a valódi <see cref="AiService"/> fut egy hamis OpenRouter-kiszolgáló ellen (nem kerül pénzbe).</summary>
public sealed class RealAiApiFactory : ApiFactory
{
    protected override bool UseRealAiService => true;
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "Api";
}

[CollectionDefinition(Name)]
public sealed class RealAiCollection : ICollectionFixture<RealAiApiFactory>
{
    public const string Name = "RealAi";
}
