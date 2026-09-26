using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocabApp.Api.Migrations;

public partial class AddStudySettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "DailyNewCardGoal",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: 20);

        migrationBuilder.AddColumn<int>(
            name: "MinimumAnswerSeconds",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.AddColumn<DateTime>(
            name: "FirstReviewedAt",
            table: "CardProgresses",
            type: "TEXT",
            nullable: true);

        migrationBuilder.Sql(
            """
            UPDATE "CardProgresses"
            SET "FirstReviewedAt" = '2024-01-01 00:00:00'
            WHERE "Interval" > 0 OR "Streak" > 0 OR "IncorrectCount" > 0;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "DailyNewCardGoal",
            table: "Users");

        migrationBuilder.DropColumn(
            name: "MinimumAnswerSeconds",
            table: "Users");

        migrationBuilder.DropColumn(
            name: "FirstReviewedAt",
            table: "CardProgresses");
    }
}
