using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocabApp.Api.Migrations;

public partial class SeedAdditionalCards : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.InsertData(
            table: "Cards",
            columns: new[] { "Id", "Definition", "Example", "Term" },
            values: new object[,]
            {
                { 6, "Showing careful and persistent effort in work or study.", "A diligent student reviews notes every evening.", "diligent" },
                { 7, "Open to more than one interpretation; not clearly defined.", "The contract clause was too ambiguous to enforce.", "ambiguous" },
                { 8, "Dealing with problems in a practical, realistic way.", "She took a pragmatic approach and fixed the most urgent issue first.", "pragmatic" },
                { 9, "Unwilling or hesitant to do something.", "He was reluctant to speak in front of the class.", "reluctant" },
                { 10, "Of considerable importance, size, or worth.", "The project needs a substantial amount of extra time.", "substantial" },
                { 11, "Possible and practical to do successfully.", "Building a small prototype first is a feasible plan.", "feasible" },
                { 12, "Honest and direct, even when the truth is uncomfortable.", "Please be candid about what still does not work.", "candid" },
                { 13, "Continue firmly despite difficulty or opposition.", "If you persist with daily practice, the words will stick.", "persist" },
                { 14, "Able to adapt to many different functions or activities.", "English is a versatile skill across many careers.", "versatile" },
                { 15, "Showing great attention to detail; very careful and precise.", "Her meticulous notes made revision much easier.", "meticulous" }
            });

        migrationBuilder.InsertData(
            table: "CardProgresses",
            columns: new[] { "Id", "CardId", "EaseFactor", "IncorrectCount", "Interval", "NextReviewDate", "Streak" },
            values: new object[,]
            {
                { 6, 6, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 7, 7, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 8, 8, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 9, 9, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 10, 10, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 11, 11, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 12, 12, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 13, 13, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 14, 14, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 },
                { 15, 15, 2.5f, 0, 0, new DateTime(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc), 0 }
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        for (var id = 6; id <= 15; id++)
        {
            migrationBuilder.DeleteData(table: "CardProgresses", keyColumn: "Id", keyValue: id);
            migrationBuilder.DeleteData(table: "Cards", keyColumn: "Id", keyValue: id);
        }
    }
}
