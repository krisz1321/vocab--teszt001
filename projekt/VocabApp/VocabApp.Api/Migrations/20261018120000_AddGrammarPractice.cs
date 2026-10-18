using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261018120000_AddGrammarPractice")]
public partial class AddGrammarPractice : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "SelectedGrammarTenses",
            table: "Users",
            type: "TEXT",
            maxLength: 300,
            nullable: false,
            defaultValue: "present_simple,past_simple");

        migrationBuilder.CreateTable(
            name: "GrammarAttempts",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                UserId = table.Column<int>(type: "INTEGER", nullable: false),
                CardId = table.Column<int>(type: "INTEGER", nullable: true),
                Tense = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                IsCorrect = table.Column<bool>(type: "INTEGER", nullable: false),
                TermUsedCorrectly = table.Column<bool>(type: "INTEGER", nullable: false),
                TenseCorrect = table.Column<bool>(type: "INTEGER", nullable: false),
                GrammarCorrect = table.Column<bool>(type: "INTEGER", nullable: false),
                CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_GrammarAttempts", x => x.Id);
                table.ForeignKey(
                    name: "FK_GrammarAttempts_Cards_CardId",
                    column: x => x.CardId,
                    principalTable: "Cards",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.SetNull);
                table.ForeignKey(
                    name: "FK_GrammarAttempts_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_GrammarAttempts_CardId",
            table: "GrammarAttempts",
            column: "CardId");

        migrationBuilder.CreateIndex(
            name: "IX_GrammarAttempts_UserId_Tense",
            table: "GrammarAttempts",
            columns: new[] { "UserId", "Tense" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "GrammarAttempts");

        migrationBuilder.DropColumn(
            name: "SelectedGrammarTenses",
            table: "Users");
    }
}
