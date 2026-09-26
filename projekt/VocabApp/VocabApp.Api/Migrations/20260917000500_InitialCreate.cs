using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocabApp.Api.Migrations;

public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Cards",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                Term = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                Definition = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                Example = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Cards", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "CardProgresses",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                CardId = table.Column<int>(type: "INTEGER", nullable: false),
                NextReviewDate = table.Column<DateTime>(
                    type: "TEXT",
                    nullable: false,
                    defaultValueSql: "CURRENT_TIMESTAMP"),
                EaseFactor = table.Column<float>(type: "REAL", nullable: false, defaultValue: 2.5f),
                Interval = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                Streak = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                IncorrectCount = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CardProgresses", x => x.Id);
                table.CheckConstraint("CK_CardProgress_EaseFactor", "EaseFactor > 0");
                table.CheckConstraint("CK_CardProgress_IncorrectCount", "IncorrectCount >= 0");
                table.CheckConstraint("CK_CardProgress_Interval", "Interval >= 0");
                table.CheckConstraint("CK_CardProgress_Streak", "Streak >= 0");
                table.ForeignKey(
                    name: "FK_CardProgresses_Cards_CardId",
                    column: x => x.CardId,
                    principalTable: "Cards",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.InsertData(
            table: "Cards",
            columns: new[] { "Id", "Definition", "Example", "Term" },
            values: new object[,]
            {
                { 1, "The chance occurrence of a pleasant or useful discovery.", "Finding that quiet bookshop was pure serendipity.", "serendipity" },
                { 2, "Able to recover quickly from difficulty or change.", "The resilient team adapted after the setback.", "resilient" },
                { 3, "Present or seeming to be present everywhere.", "Smartphones have become ubiquitous in daily life.", "ubiquitous" },
                { 4, "Giving much information clearly in very few words.", "Her concise summary captured every important point.", "concise" },
                { 5, "The ability to understand and share another person's feelings.", "Good mentors listen with patience and empathy.", "empathy" }
            });

        migrationBuilder.InsertData(
            table: "CardProgresses",
            columns: new[] { "Id", "CardId", "EaseFactor", "IncorrectCount", "Interval", "NextReviewDate", "Streak" },
            values: new object[,]
            {
                { 1, 1, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 2, 2, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 3, 3, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 4, 4, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 5, 5, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 }
            });

        migrationBuilder.CreateIndex(
            name: "IX_CardProgresses_CardId",
            table: "CardProgresses",
            column: "CardId",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "CardProgresses");
        migrationBuilder.DropTable(name: "Cards");
    }
}
