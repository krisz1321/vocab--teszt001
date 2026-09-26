using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260917000500_InitialCreate")]
partial class InitialCreate
{
    protected override void BuildTargetModel(ModelBuilder modelBuilder)
    {
#pragma warning disable 612, 618
        modelBuilder.HasAnnotation("ProductVersion", "8.0.21");

        modelBuilder.Entity("VocabApp.Api.Models.Card", entity =>
        {
            entity.Property<int>("Id")
                .ValueGeneratedOnAdd()
                .HasColumnType("INTEGER")
                .HasAnnotation("Sqlite:Autoincrement", true);
            entity.Property<string>("Definition")
                .IsRequired()
                .HasMaxLength(500)
                .HasColumnType("TEXT");
            entity.Property<string>("Example")
                .HasMaxLength(500)
                .HasColumnType("TEXT");
            entity.Property<string>("Term")
                .IsRequired()
                .HasMaxLength(100)
                .HasColumnType("TEXT");
            entity.HasKey("Id");
            entity.ToTable("Cards");
            entity.HasData(
                new { Id = 1, Definition = "The chance occurrence of a pleasant or useful discovery.", Example = "Finding that quiet bookshop was pure serendipity.", Term = "serendipity" },
                new { Id = 2, Definition = "Able to recover quickly from difficulty or change.", Example = "The resilient team adapted after the setback.", Term = "resilient" },
                new { Id = 3, Definition = "Present or seeming to be present everywhere.", Example = "Smartphones have become ubiquitous in daily life.", Term = "ubiquitous" },
                new { Id = 4, Definition = "Giving much information clearly in very few words.", Example = "Her concise summary captured every important point.", Term = "concise" },
                new { Id = 5, Definition = "The ability to understand and share another person's feelings.", Example = "Good mentors listen with patience and empathy.", Term = "empathy" });
        });

        modelBuilder.Entity("VocabApp.Api.Models.CardProgress", entity =>
        {
            entity.Property<int>("Id")
                .ValueGeneratedOnAdd()
                .HasColumnType("INTEGER")
                .HasAnnotation("Sqlite:Autoincrement", true);
            entity.Property<int>("CardId")
                .HasColumnType("INTEGER");
            entity.Property<float>("EaseFactor")
                .ValueGeneratedOnAdd()
                .HasColumnType("REAL")
                .HasDefaultValue(2.5f);
            entity.Property<int>("IncorrectCount")
                .ValueGeneratedOnAdd()
                .HasColumnType("INTEGER")
                .HasDefaultValue(0);
            entity.Property<int>("Interval")
                .ValueGeneratedOnAdd()
                .HasColumnType("INTEGER")
                .HasDefaultValue(0);
            entity.Property<DateTime>("NextReviewDate")
                .ValueGeneratedOnAdd()
                .HasColumnType("TEXT")
                .HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property<int>("Streak")
                .ValueGeneratedOnAdd()
                .HasColumnType("INTEGER")
                .HasDefaultValue(0);
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
                new { Id = 5, CardId = 5, EaseFactor = 2.5f, IncorrectCount = 0, Interval = 0, NextReviewDate = new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), Streak = 0 });
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
            entity.Navigation("Progress");
        });
#pragma warning restore 612, 618
    }
}
