using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260925030000_AddDecks")]
partial class AddDecks
{
    protected override void BuildTargetModel(ModelBuilder modelBuilder)
    {
#pragma warning disable 612, 618
        modelBuilder.HasAnnotation("ProductVersion", "8.0.21");

        modelBuilder.Entity("VocabApp.Api.Models.Card", entity =>
        {
            entity.Property<int>("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                .HasAnnotation("Sqlite:Autoincrement", true);
            entity.Property<int>("DeckId").HasColumnType("INTEGER");
            entity.Property<string>("Definition").IsRequired().HasMaxLength(500).HasColumnType("TEXT");
            entity.Property<string>("Example").HasMaxLength(500).HasColumnType("TEXT");
            entity.Property<string>("Term").IsRequired().HasMaxLength(100).HasColumnType("TEXT");
            entity.HasKey("Id");
            entity.HasIndex("DeckId");
            entity.ToTable("Cards");
            entity.HasData(
                new { Id = 1, DeckId = 1, Definition = "The chance occurrence of a pleasant or useful discovery.", Example = "Finding that quiet bookshop was pure serendipity.", Term = "serendipity" },
                new { Id = 2, DeckId = 1, Definition = "Able to recover quickly from difficulty or change.", Example = "The resilient team adapted after the setback.", Term = "resilient" },
                new { Id = 3, DeckId = 1, Definition = "Present or seeming to be present everywhere.", Example = "Smartphones have become ubiquitous in daily life.", Term = "ubiquitous" },
                new { Id = 4, DeckId = 1, Definition = "Giving much information clearly in very few words.", Example = "Her concise summary captured every important point.", Term = "concise" },
                new { Id = 5, DeckId = 1, Definition = "The ability to understand and share another person's feelings.", Example = "Good mentors listen with patience and empathy.", Term = "empathy" },
                new { Id = 6, DeckId = 1, Definition = "Showing careful and persistent effort in work or study.", Example = "A diligent student reviews notes every evening.", Term = "diligent" },
                new { Id = 7, DeckId = 1, Definition = "Open to more than one interpretation; not clearly defined.", Example = "The contract clause was too ambiguous to enforce.", Term = "ambiguous" },
                new { Id = 8, DeckId = 1, Definition = "Dealing with problems in a practical, realistic way.", Example = "She took a pragmatic approach and fixed the most urgent issue first.", Term = "pragmatic" },
                new { Id = 9, DeckId = 1, Definition = "Unwilling or hesitant to do something.", Example = "He was reluctant to speak in front of the class.", Term = "reluctant" },
                new { Id = 10, DeckId = 1, Definition = "Of considerable importance, size, or worth.", Example = "The project needs a substantial amount of extra time.", Term = "substantial" },
                new { Id = 11, DeckId = 1, Definition = "Possible and practical to do successfully.", Example = "Building a small prototype first is a feasible plan.", Term = "feasible" },
                new { Id = 12, DeckId = 1, Definition = "Honest and direct, even when the truth is uncomfortable.", Example = "Please be candid about what still does not work.", Term = "candid" },
                new { Id = 13, DeckId = 1, Definition = "Continue firmly despite difficulty or opposition.", Example = "If you persist with daily practice, the words will stick.", Term = "persist" },
                new { Id = 14, DeckId = 1, Definition = "Able to adapt to many different functions or activities.", Example = "English is a versatile skill across many careers.", Term = "versatile" },
                new { Id = 15, DeckId = 1, Definition = "Showing great attention to detail; very careful and precise.", Example = "Her meticulous notes made revision much easier.", Term = "meticulous" });
        });

        modelBuilder.Entity("VocabApp.Api.Models.CardProgress", entity =>
        {
            entity.Property<int>("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                .HasAnnotation("Sqlite:Autoincrement", true);
            entity.Property<int>("CardId").HasColumnType("INTEGER");
            entity.Property<float>("EaseFactor").ValueGeneratedOnAdd().HasColumnType("REAL").HasDefaultValue(2.5f);
            entity.Property<int>("IncorrectCount").ValueGeneratedOnAdd().HasColumnType("INTEGER").HasDefaultValue(0);
            entity.Property<int>("Interval").ValueGeneratedOnAdd().HasColumnType("INTEGER").HasDefaultValue(0);
            entity.Property<DateTime>("NextReviewDate").ValueGeneratedOnAdd().HasColumnType("TEXT").HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property<int>("Streak").ValueGeneratedOnAdd().HasColumnType("INTEGER").HasDefaultValue(0);
            entity.HasKey("Id");
            entity.HasIndex("CardId").IsUnique();
            entity.ToTable("CardProgresses", table =>
            {
                table.HasCheckConstraint("CK_CardProgress_EaseFactor", "EaseFactor > 0");
                table.HasCheckConstraint("CK_CardProgress_IncorrectCount", "IncorrectCount >= 0");
                table.HasCheckConstraint("CK_CardProgress_Interval", "Interval >= 0");
                table.HasCheckConstraint("CK_CardProgress_Streak", "Streak >= 0");
            });
            entity.HasData(
                new { Id = 1, CardId = 1, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 2, CardId = 2, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 3, CardId = 3, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 4, CardId = 4, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 5, CardId = 5, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 6, CardId = 6, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 7, CardId = 7, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 8, CardId = 8, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 9, CardId = 9, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 10, CardId = 10, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 11, CardId = 11, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 12, CardId = 12, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 13, CardId = 13, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 14, CardId = 14, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 },
                new { Id = 15, CardId = 15, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 });
        });

        modelBuilder.Entity("VocabApp.Api.Models.Deck", entity =>
        {
            entity.Property<int>("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                .HasAnnotation("Sqlite:Autoincrement", true);
            entity.Property<string>("Name").IsRequired().HasMaxLength(100).HasColumnType("TEXT");
            entity.Property<int>("UserId").HasColumnType("INTEGER");
            entity.HasKey("Id");
            entity.HasIndex("UserId");
            entity.ToTable("Decks");
        });

        modelBuilder.Entity("VocabApp.Api.Models.User", entity =>
        {
            entity.Property<int>("Id").ValueGeneratedOnAdd().HasColumnType("INTEGER")
                .HasAnnotation("Sqlite:Autoincrement", true);
            entity.Property<string>("Email").IsRequired().HasMaxLength(256).HasColumnType("TEXT");
            entity.Property<string>("PasswordHash").IsRequired().HasColumnType("TEXT");
            entity.HasKey("Id");
            entity.HasIndex("Email").IsUnique();
            entity.ToTable("Users");
        });

        modelBuilder.Entity("VocabApp.Api.Models.CardProgress", entity =>
        {
            entity.HasOne("VocabApp.Api.Models.Card", "Card")
                .WithOne("Progress")
                .HasForeignKey("VocabApp.Api.Models.CardProgress", "CardId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
            entity.Navigation("Card");
        });

        modelBuilder.Entity("VocabApp.Api.Models.Card", entity =>
        {
            entity.HasOne("VocabApp.Api.Models.Deck", "Deck")
                .WithMany("Cards")
                .HasForeignKey("DeckId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
            entity.Navigation("Deck");
            entity.Navigation("Progress");
        });

        modelBuilder.Entity("VocabApp.Api.Models.Deck", entity =>
        {
            entity.HasOne("VocabApp.Api.Models.User", "User")
                .WithMany("Decks")
                .HasForeignKey("UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
            entity.Navigation("User");
        });

        modelBuilder.Entity("VocabApp.Api.Models.Deck", entity =>
        {
            entity.Navigation("Cards");
        });

        modelBuilder.Entity("VocabApp.Api.Models.User", entity =>
        {
            entity.Navigation("Decks");
        });
#pragma warning restore 612, 618
    }
}
