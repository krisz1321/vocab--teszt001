using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260926012000_AddStudyStatistics")]
public partial class AddStudyStatistics : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "LongestStudyDayStreak",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<DateTime>(
            name: "LastStudyDate",
            table: "Users",
            type: "TEXT",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "StudyDayStreak",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<int>(
            name: "CorrectCount",
            table: "CardProgresses",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<DateTime>(
            name: "LearnedAt",
            table: "CardProgresses",
            type: "TEXT",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "UserStudyDays",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                UserId = table.Column<int>(type: "INTEGER", nullable: false),
                DayUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                SecondsStudied = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                AnswerCount = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                CorrectCount = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0),
                IncorrectCount = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_UserStudyDays", x => x.Id);
                table.ForeignKey(
                    name: "FK_UserStudyDays_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_UserStudyDays_UserId_DayUtc",
            table: "UserStudyDays",
            columns: new[] { "UserId", "DayUtc" },
            unique: true);

        migrationBuilder.Sql(
            """
            UPDATE "CardProgresses"
            SET "CorrectCount" = "Streak"
            WHERE "Streak" > 0 AND "CorrectCount" = 0;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "UserStudyDays");

        migrationBuilder.DropColumn(
            name: "LearnedAt",
            table: "CardProgresses");

        migrationBuilder.DropColumn(
            name: "CorrectCount",
            table: "CardProgresses");

        migrationBuilder.DropColumn(
            name: "LastStudyDate",
            table: "Users");

        migrationBuilder.DropColumn(
            name: "LongestStudyDayStreak",
            table: "Users");

        migrationBuilder.DropColumn(
            name: "StudyDayStreak",
            table: "Users");
    }
}
