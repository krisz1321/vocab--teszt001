using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Models;
using VocabApp.Api.Services;

namespace VocabApp.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public const int SeedDeckId = 1;

    public DbSet<AiCache> AiCaches => Set<AiCache>();
    public DbSet<Card> Cards => Set<Card>();
    public DbSet<CardConfusion> CardConfusions => Set<CardConfusion>();
    public DbSet<CardProgress> CardProgresses => Set<CardProgress>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserStudyDay> UserStudyDays => Set<UserStudyDay>();
    public DbSet<Deck> Decks => Set<Deck>();
    public DbSet<SharedDeck> SharedDecks => Set<SharedDeck>();
    public DbSet<SharedDeckCard> SharedDeckCards => Set<SharedDeckCard>();
    public DbSet<SharedDeckSave> SharedDeckSaves => Set<SharedDeckSave>();
    public DbSet<FreeStudyMark> FreeStudyMarks => Set<FreeStudyMark>();
    public DbSet<SavedExample> SavedExamples => Set<SavedExample>();
    public DbSet<SavedDefinition> SavedDefinitions => Set<SavedDefinition>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var cache = modelBuilder.Entity<AiCache>();
        cache.Property(c => c.PromptHash).IsRequired().HasMaxLength(64);
        cache.Property(c => c.ResponseText).IsRequired();
        cache.HasIndex(c => c.PromptHash).IsUnique();

        var user = modelBuilder.Entity<User>();
        user.Property(u => u.Email).IsRequired().HasMaxLength(256);
        user.Property(u => u.Username).IsRequired().HasMaxLength(Usernames.MaxLength).UseCollation("NOCASE");
        user.Property(u => u.PasswordHash).IsRequired();
        user.Property(u => u.DisplayName).HasMaxLength(80);
        user.Property(u => u.DailyNewCardGoal).HasDefaultValue(20);
        user.Property(u => u.MinimumAnswerSeconds).HasDefaultValue(0);
        user.Property(u => u.AutomaticAiCheck).HasDefaultValue(false);
        user.Property(u => u.AcceptHungarianParaphrase).HasDefaultValue(false);
        user.Property(u => u.RequireAppealReason).HasDefaultValue(true);
        user.Property(u => u.ReuseSavedExamples).HasDefaultValue(true);
        user.Property(u => u.SavedLevelPolicy).IsRequired().HasMaxLength(16).HasDefaultValue(SavedLevelPolicies.Exact);
        user.Property(u => u.GenerateAlternateDefinitions).HasDefaultValue(true);
        user.Property(u => u.LeechThreshold).HasDefaultValue(CardLeech.DefaultThreshold);
        user.Property(u => u.ExampleLevel).IsRequired().HasMaxLength(2).HasDefaultValue(ExampleLevels.Default);
        user.Property(u => u.AiModel).IsRequired().HasMaxLength(64).HasDefaultValue(AiModels.Default);
        user.Property(u => u.TimeZoneId).IsRequired().HasMaxLength(128).HasDefaultValue(StudyClock.DefaultTimeZoneId);
        user.Property(u => u.StudyDayStreak).HasDefaultValue(0);
        user.Property(u => u.LongestStudyDayStreak).HasDefaultValue(0);
        user.Property(u => u.AiCallCount).HasDefaultValue(0);
        user.HasIndex(u => u.Email).IsUnique();
        user.HasIndex(u => u.Username).IsUnique();
        user.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_Users_DailyNewCardGoal",
                "DailyNewCardGoal >= 0 AND DailyNewCardGoal <= 100");
            table.HasCheckConstraint(
                "CK_Users_MinimumAnswerSeconds",
                "MinimumAnswerSeconds >= 0 AND MinimumAnswerSeconds <= 120");
        });
        user.HasMany(u => u.Decks)
            .WithOne(d => d.User)
            .HasForeignKey(d => d.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        user.HasMany(u => u.StudyDays)
            .WithOne(day => day.User)
            .HasForeignKey(day => day.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var studyDay = modelBuilder.Entity<UserStudyDay>();
        studyDay.HasIndex(day => new { day.UserId, day.DayUtc }).IsUnique();
        studyDay.Property(day => day.SecondsStudied).HasDefaultValue(0);
        studyDay.Property(day => day.AnswerCount).HasDefaultValue(0);
        studyDay.Property(day => day.CorrectCount).HasDefaultValue(0);
        studyDay.Property(day => day.IncorrectCount).HasDefaultValue(0);

        var savedExample = modelBuilder.Entity<SavedExample>();
        savedExample.Property(item => item.TermKey).IsRequired().HasMaxLength(100);
        savedExample.Property(item => item.DefinitionKey).IsRequired().HasMaxLength(500);
        savedExample.Property(item => item.Level).IsRequired().HasMaxLength(2).HasDefaultValue(ExampleLevels.Default);
        savedExample.Property(item => item.Sentence).IsRequired().HasMaxLength(500);
        savedExample.HasIndex(item => new { item.TermKey, item.DefinitionKey, item.Level, item.Sentence }).IsUnique();

        var savedDefinition = modelBuilder.Entity<SavedDefinition>();
        savedDefinition.Property(item => item.TermKey).IsRequired().HasMaxLength(100);
        savedDefinition.Property(item => item.Level).IsRequired().HasMaxLength(2);
        savedDefinition.Property(item => item.Definition).IsRequired().HasMaxLength(500);
        savedDefinition.HasIndex(item => new { item.TermKey, item.Level, item.Definition }).IsUnique();

        var deck = modelBuilder.Entity<Deck>();
        deck.Property(d => d.Name).IsRequired().HasMaxLength(100);
        deck.Property(d => d.Description).HasMaxLength(DeckLimits.MaxDescriptionLength);
        deck.Property(d => d.ExampleLevel).HasMaxLength(2);
        deck.HasOne(d => d.SourceSharedDeck)
            .WithMany()
            .HasForeignKey(d => d.SourceSharedDeckId)
            .OnDelete(DeleteBehavior.SetNull);
        deck.HasIndex(d => d.SourceSharedDeckId);

        var sharedDeck = modelBuilder.Entity<SharedDeck>();
        sharedDeck.Property(s => s.Name).IsRequired().HasMaxLength(DeckLimits.MaxNameLength);
        sharedDeck.Property(s => s.Description).HasMaxLength(DeckLimits.MaxDescriptionLength);
        sharedDeck.Property(s => s.ExampleLevel).HasMaxLength(2);
        sharedDeck.Property(s => s.ContentHash).IsRequired().HasMaxLength(64);
        sharedDeck.HasIndex(s => s.SourceDeckId).IsUnique();
        sharedDeck.HasIndex(s => s.OwnerId);
        sharedDeck.HasOne(s => s.Owner)
            .WithMany()
            .HasForeignKey(s => s.OwnerId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        sharedDeck.HasOne(s => s.SourceDeck)
            .WithOne(d => d.SharedDeck)
            .HasForeignKey<SharedDeck>(s => s.SourceDeckId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var sharedCard = modelBuilder.Entity<SharedDeckCard>();
        sharedCard.Property(c => c.Term).IsRequired().HasMaxLength(100);
        sharedCard.Property(c => c.Definition).IsRequired().HasMaxLength(500);
        sharedCard.Property(c => c.Example).HasMaxLength(500);
        sharedCard.Property(c => c.TargetMeanings).HasMaxLength(200);
        sharedCard.Property(c => c.Tags).HasMaxLength(CardTags.MaxStoredLength);
        sharedCard.HasOne(c => c.SharedDeck)
            .WithMany(s => s.Cards)
            .HasForeignKey(c => c.SharedDeckId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var sharedSave = modelBuilder.Entity<SharedDeckSave>();
        sharedSave.HasIndex(s => new { s.SharedDeckId, s.UserId }).IsUnique();
        sharedSave.HasIndex(s => s.UserId);
        sharedSave.HasOne(s => s.SharedDeck)
            .WithMany(d => d.Saves)
            .HasForeignKey(s => s.SharedDeckId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        sharedSave.HasOne(s => s.User)
            .WithMany()
            .HasForeignKey(s => s.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var card = modelBuilder.Entity<Card>();
        card.Property(c => c.Term).IsRequired().HasMaxLength(100);
        card.Property(c => c.Definition).IsRequired().HasMaxLength(500);
        card.Property(c => c.Example).HasMaxLength(500);
        card.Property(c => c.TargetMeanings).HasMaxLength(200);
        card.Property(c => c.Tags).HasMaxLength(CardTags.MaxStoredLength);
        card.HasOne(c => c.Deck)
            .WithMany(d => d.Cards)
            .HasForeignKey(c => c.DeckId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        card.HasOne(c => c.Progress)
            .WithOne(cp => cp.Card)
            .HasForeignKey<CardProgress>(cp => cp.CardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var confusion = modelBuilder.Entity<CardConfusion>();
        confusion.Property(item => item.Count).HasDefaultValue(1);
        confusion.HasIndex(item => new { item.UserId, item.CardId, item.ConfusedWithCardId }).IsUnique();
        confusion.HasOne(item => item.User)
            .WithMany()
            .HasForeignKey(item => item.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        confusion.HasOne(item => item.Card)
            .WithMany()
            .HasForeignKey(item => item.CardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        confusion.HasOne(item => item.ConfusedWithCard)
            .WithMany()
            .HasForeignKey(item => item.ConfusedWithCardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var freeMark = modelBuilder.Entity<FreeStudyMark>();
        freeMark.HasIndex(mark => new { mark.UserId, mark.CardId }).IsUnique();
        freeMark.HasOne(mark => mark.User)
            .WithMany()
            .HasForeignKey(mark => mark.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        freeMark.HasOne(mark => mark.Card)
            .WithMany()
            .HasForeignKey(mark => mark.CardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var progress = modelBuilder.Entity<CardProgress>();
        progress.HasIndex(cp => cp.CardId).IsUnique();
        progress.Property(cp => cp.NextReviewDate).HasDefaultValueSql("CURRENT_TIMESTAMP");
        progress.Property(cp => cp.EaseFactor).HasDefaultValue(2.5f);
        progress.Property(cp => cp.Interval).HasDefaultValue(0);
        progress.Property(cp => cp.Streak).HasDefaultValue(0);
        progress.Property(cp => cp.IncorrectCount).HasDefaultValue(0);
        progress.Property(cp => cp.CorrectCount).HasDefaultValue(0);
        progress.Property(cp => cp.MarkedKnown).HasDefaultValue(false);
        progress.ToTable(table =>
        {
            table.HasCheckConstraint("CK_CardProgress_Interval", "Interval >= 0");
            table.HasCheckConstraint("CK_CardProgress_Streak", "Streak >= 0");
            table.HasCheckConstraint("CK_CardProgress_IncorrectCount", "IncorrectCount >= 0");
            table.HasCheckConstraint("CK_CardProgress_EaseFactor", "EaseFactor > 0");
        });

        card.HasData(
            new Card { Id = 1, DeckId = SeedDeckId, Term = "serendipity", Definition = "The chance occurrence of a pleasant or useful discovery.", Example = "Finding that quiet bookshop was pure serendipity." },
            new Card { Id = 2, DeckId = SeedDeckId, Term = "resilient", Definition = "Able to recover quickly from difficulty or change.", Example = "The resilient team adapted after the setback." },
            new Card { Id = 3, DeckId = SeedDeckId, Term = "ubiquitous", Definition = "Present or seeming to be present everywhere.", Example = "Smartphones have become ubiquitous in daily life." },
            new Card { Id = 4, DeckId = SeedDeckId, Term = "concise", Definition = "Giving much information clearly in very few words.", Example = "Her concise summary captured every important point." },
            new Card { Id = 5, DeckId = SeedDeckId, Term = "empathy", Definition = "The ability to understand and share another person's feelings.", Example = "Good mentors listen with patience and empathy." },
            new Card { Id = 6, DeckId = SeedDeckId, Term = "diligent", Definition = "Showing careful and persistent effort in work or study.", Example = "A diligent student reviews notes every evening." },
            new Card { Id = 7, DeckId = SeedDeckId, Term = "ambiguous", Definition = "Open to more than one interpretation; not clearly defined.", Example = "The contract clause was too ambiguous to enforce." },
            new Card { Id = 8, DeckId = SeedDeckId, Term = "pragmatic", Definition = "Dealing with problems in a practical, realistic way.", Example = "She took a pragmatic approach and fixed the most urgent issue first." },
            new Card { Id = 9, DeckId = SeedDeckId, Term = "reluctant", Definition = "Unwilling or hesitant to do something.", Example = "He was reluctant to speak in front of the class." },
            new Card { Id = 10, DeckId = SeedDeckId, Term = "substantial", Definition = "Of considerable importance, size, or worth.", Example = "The project needs a substantial amount of extra time." },
            new Card { Id = 11, DeckId = SeedDeckId, Term = "feasible", Definition = "Possible and practical to do successfully.", Example = "Building a small prototype first is a feasible plan." },
            new Card { Id = 12, DeckId = SeedDeckId, Term = "candid", Definition = "Honest and direct, even when the truth is uncomfortable.", Example = "Please be candid about what still does not work." },
            new Card { Id = 13, DeckId = SeedDeckId, Term = "persist", Definition = "Continue firmly despite difficulty or opposition.", Example = "If you persist with daily practice, the words will stick." },
            new Card { Id = 14, DeckId = SeedDeckId, Term = "versatile", Definition = "Able to adapt to many different functions or activities.", Example = "English is a versatile skill across many careers." },
            new Card { Id = 15, DeckId = SeedDeckId, Term = "meticulous", Definition = "Showing great attention to detail; very careful and precise.", Example = "Her meticulous notes made revision much easier." });

        var seedDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        progress.HasData(
            Enumerable.Range(1, 15).Select(id => new CardProgress
            {
                Id = id,
                CardId = id,
                NextReviewDate = seedDate,
                EaseFactor = 2.5f,
                Interval = 0,
                Streak = 0,
                IncorrectCount = 0,
                CorrectCount = 0
            }));
    }
}
