using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260929010000_AddExampleLevels")]
public partial class AddExampleLevels : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ExampleLevel",
            table: "Users",
            type: "TEXT",
            maxLength: 2,
            nullable: false,
            defaultValue: "B1");

        migrationBuilder.AddColumn<string>(
            name: "ExampleLevel",
            table: "Decks",
            type: "TEXT",
            maxLength: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Level",
            table: "SavedExamples",
            type: "TEXT",
            maxLength: 2,
            nullable: false,
            defaultValue: "B1");

        migrationBuilder.DropIndex(
            name: "IX_SavedExamples_TermKey_DefinitionKey_Sentence",
            table: "SavedExamples");

        migrationBuilder.CreateIndex(
            name: "IX_SavedExamples_TermKey_DefinitionKey_Level_Sentence",
            table: "SavedExamples",
            columns: new[] { "TermKey", "DefinitionKey", "Level", "Sentence" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_SavedExamples_TermKey_DefinitionKey_Level_Sentence",
            table: "SavedExamples");

        migrationBuilder.DropColumn(
            name: "Level",
            table: "SavedExamples");

        migrationBuilder.CreateIndex(
            name: "IX_SavedExamples_TermKey_DefinitionKey_Sentence",
            table: "SavedExamples",
            columns: new[] { "TermKey", "DefinitionKey", "Sentence" },
            unique: true);

        migrationBuilder.DropColumn(
            name: "ExampleLevel",
            table: "Decks");

        migrationBuilder.DropColumn(
            name: "ExampleLevel",
            table: "Users");
    }
}
