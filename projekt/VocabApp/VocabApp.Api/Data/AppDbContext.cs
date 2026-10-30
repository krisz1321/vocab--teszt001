using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Models;
using VocabApp.Api.Services;

namespace VocabApp.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AiCache> AiCaches => Set<AiCache>();
    public DbSet<Card> Cards => Set<Card>();
    public DbSet<CardConfusion> CardConfusions => Set<CardConfusion>();
    public DbSet<CardProgress> CardProgresses => Set<CardProgress>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserStudyDay> UserStudyDays => Set<UserStudyDay>();
    public DbSet<UserAiFillDay> UserAiFillDays => Set<UserAiFillDay>();
    public DbSet<Deck> Decks => Set<Deck>();
    public DbSet<SharedDeck> SharedDecks => Set<SharedDeck>();
    public DbSet<SharedDeckCard> SharedDeckCards => Set<SharedDeckCard>();
    public DbSet<SharedDeckSave> SharedDeckSaves => Set<SharedDeckSave>();
    public DbSet<FreeStudyMark> FreeStudyMarks => Set<FreeStudyMark>();
    public DbSet<GrammarAttempt> GrammarAttempts => Set<GrammarAttempt>();
    public DbSet<CompositionAttempt> CompositionAttempts => Set<CompositionAttempt>();
    public DbSet<CompositionAttemptWord> CompositionAttemptWords => Set<CompositionAttemptWord>();
    public DbSet<SavedExample> SavedExamples => Set<SavedExample>();
    public DbSet<SavedDefinition> SavedDefinitions => Set<SavedDefinition>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Kis- és nagybetű-független, ékezetérzékeny. Kifejezetten megadva, mert egy magyar nyelvű telepítés alapértéke
        // a Hungarian_CI_AS lenne, ami az "sz", "cs" stb. betűket egy betűnek veszi, és így a részszöveg-keresés téveszt.
        modelBuilder.UseCollation("Latin1_General_100_CI_AS");

        // Több kaszkádútvonal nem vezethet ugyanahhoz a táblához, ezért a Users-ből a Decks-en és a Cards-on át futó ág
        // maradt kaszkádolt. A többi idegen kulcs NO ACTION, ezek rendbetétele a DeleteCascade osztály dolga.
        var cache = modelBuilder.Entity<AiCache>();
        cache.Property(c => c.PromptHash).IsRequired().HasMaxLength(64);
        cache.Property(c => c.ResponseText).IsRequired();
        cache.HasIndex(c => c.PromptHash).IsUnique();

        var user = modelBuilder.Entity<User>();
        user.Property(u => u.Email).IsRequired().HasMaxLength(256);
        user.Property(u => u.Username).IsRequired().HasMaxLength(Usernames.MaxLength);
        user.Property(u => u.PasswordHash).IsRequired();
        user.Property(u => u.DisplayName).HasMaxLength(80);
        user.Property(u => u.DailyNewCardGoal).HasDefaultValue(20);
        user.Property(u => u.MinimumAnswerSeconds).HasDefaultValue(0);
        user.Property(u => u.AutomaticAiCheck).HasDefaultValue(true);
        user.Property(u => u.AcceptHungarianParaphrase).HasDefaultValue(false);
        user.Property(u => u.AcceptPartialMeaningMatch).HasDefaultValue(true);
        user.Property(u => u.AcceptEnglishSynonyms).HasDefaultValue(false);
        user.Property(u => u.RepeatMistakes).HasDefaultValue(true);
        user.Property(u => u.RequireAppealReason).HasDefaultValue(true);
        user.Property(u => u.ReuseSavedExamples).HasDefaultValue(true);
        user.Property(u => u.SavedLevelPolicy).IsRequired().HasMaxLength(16).HasDefaultValue(SavedLevelPolicies.Exact);
        user.Property(u => u.GenerateAlternateDefinitions).HasDefaultValue(true);
        user.Property(u => u.LeechThreshold).HasDefaultValue(CardLeech.DefaultThreshold);
        user.Property(u => u.ExampleLevel).IsRequired().HasMaxLength(2).HasDefaultValue(ExampleLevels.Default);
        user.Property(u => u.AiModel).IsRequired().HasMaxLength(64).HasDefaultValue(AiModels.Default);
        user.Property(u => u.TimeZoneId).IsRequired().HasMaxLength(128).HasDefaultValue(StudyClock.DefaultTimeZoneId);
        user.Property(u => u.AiFillBatchSize).HasDefaultValue(AiFillLimits.DefaultBatchSize);
        user.Property(u => u.SelectedGrammarTenses).IsRequired().HasMaxLength(GrammarTenses.MaxStoredLength).HasDefaultValue(GrammarTenses.Default);
        user.Property(u => u.GrammarShowTranslation).HasDefaultValue(false);
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

        user.HasMany(u => u.AiFillDays)
            .WithOne(day => day.User)
            .HasForeignKey(day => day.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var aiFillDay = modelBuilder.Entity<UserAiFillDay>();
        aiFillDay.HasIndex(day => new { day.UserId, day.Day }).IsUnique();
        aiFillDay.Property(day => day.Count).HasDefaultValue(0);

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
        // A négy oszlop együtt meghaladná az indexkulcs 1700 bájtos korlátját, ezért az egyediség a lenyomatukon van.
        savedExample.Property<byte[]>("KeyHash")
            .IsRequired()
            .HasMaxLength(32)
            .HasComputedColumnSql(
                "CONVERT(binary(32), HASHBYTES('SHA2_256', [TermKey] + N'|' + [DefinitionKey] + N'|' + [Level] + N'|' + [Sentence]))",
                stored: true);
        savedExample.HasIndex("KeyHash").IsUnique();
        savedExample.HasIndex(item => new { item.TermKey, item.DefinitionKey });

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
            .OnDelete(DeleteBehavior.NoAction);
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
            .OnDelete(DeleteBehavior.NoAction);
        sharedDeck.HasOne(s => s.SourceDeck)
            .WithOne(d => d.SharedDeck)
            .HasForeignKey<SharedDeck>(s => s.SourceDeckId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var sharedCard = modelBuilder.Entity<SharedDeckCard>();
        sharedCard.Property(c => c.Term).IsRequired().HasMaxLength(100);
        sharedCard.Property(c => c.Definition).IsRequired().HasMaxLength(500);
        sharedCard.Property(c => c.Example).HasMaxLength(500);
        sharedCard.Property(c => c.TargetMeanings).HasMaxLength(300);
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
            .OnDelete(DeleteBehavior.NoAction);

        var card = modelBuilder.Entity<Card>();
        card.Property(c => c.Term).IsRequired().HasMaxLength(100);
        card.Property(c => c.Definition).IsRequired().HasMaxLength(500);
        card.Property(c => c.Example).HasMaxLength(500);
        card.Property(c => c.TargetMeanings).HasMaxLength(300);
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
            .OnDelete(DeleteBehavior.NoAction);
        confusion.HasOne(item => item.Card)
            .WithMany()
            .HasForeignKey(item => item.CardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        confusion.HasOne(item => item.ConfusedWithCard)
            .WithMany()
            .HasForeignKey(item => item.ConfusedWithCardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.NoAction);

        var freeMark = modelBuilder.Entity<FreeStudyMark>();
        freeMark.HasIndex(mark => new { mark.UserId, mark.CardId }).IsUnique();
        freeMark.HasOne(mark => mark.User)
            .WithMany()
            .HasForeignKey(mark => mark.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.NoAction);
        freeMark.HasOne(mark => mark.Card)
            .WithMany()
            .HasForeignKey(mark => mark.CardId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        var grammarAttempt = modelBuilder.Entity<GrammarAttempt>();
        grammarAttempt.Property(attempt => attempt.Tense).IsRequired().HasMaxLength(GrammarTenses.MaxKeyLength);
        grammarAttempt.Property(attempt => attempt.ManuallyAccepted).HasDefaultValue(false);
        grammarAttempt.HasIndex(attempt => new { attempt.UserId, attempt.Tense });
        grammarAttempt.HasOne(attempt => attempt.User)
            .WithMany()
            .HasForeignKey(attempt => attempt.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.NoAction);
        grammarAttempt.HasOne(attempt => attempt.Card)
            .WithMany()
            .HasForeignKey(attempt => attempt.CardId)
            .OnDelete(DeleteBehavior.SetNull);

        var compositionAttempt = modelBuilder.Entity<CompositionAttempt>();
        compositionAttempt.Property(attempt => attempt.ManuallyAccepted).HasDefaultValue(false);
        compositionAttempt.HasIndex(attempt => attempt.UserId);
        compositionAttempt.HasOne(attempt => attempt.User)
            .WithMany()
            .HasForeignKey(attempt => attempt.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.NoAction);
        compositionAttempt.HasMany(attempt => attempt.Words)
            .WithOne(word => word.Attempt)
            .HasForeignKey(word => word.AttemptId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<CompositionAttemptWord>()
            .HasOne(word => word.Card)
            .WithMany()
            .HasForeignKey(word => word.CardId)
            .OnDelete(DeleteBehavior.SetNull);

        var progress = modelBuilder.Entity<CardProgress>();
        progress.HasIndex(cp => cp.CardId).IsUnique();
        progress.Property(cp => cp.NextReviewDate).HasDefaultValueSql("SYSUTCDATETIME()");
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
    }
}
