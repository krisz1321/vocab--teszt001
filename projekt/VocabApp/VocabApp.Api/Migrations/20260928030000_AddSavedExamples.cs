using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260928030000_AddSavedExamples")]
public partial class AddSavedExamples : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "ReuseSavedExamples",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: true);

        migrationBuilder.CreateTable(
            name: "SavedExamples",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                TermKey = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                DefinitionKey = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                Sentence = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SavedExamples", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_SavedExamples_TermKey_DefinitionKey_Sentence",
            table: "SavedExamples",
            columns: new[] { "TermKey", "DefinitionKey", "Sentence" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "SavedExamples");

        migrationBuilder.DropColumn(
            name: "ReuseSavedExamples",
            table: "Users");
    }
}
