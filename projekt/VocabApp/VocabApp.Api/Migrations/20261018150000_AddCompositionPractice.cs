using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261018150000_AddCompositionPractice")]
public partial class AddCompositionPractice : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CompositionAttempts",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                UserId = table.Column<int>(type: "INTEGER", nullable: false),
                IsCorrect = table.Column<bool>(type: "INTEGER", nullable: false),
                GrammarCorrect = table.Column<bool>(type: "INTEGER", nullable: false),
                Coherent = table.Column<bool>(type: "INTEGER", nullable: false),
                ManuallyAccepted = table.Column<bool>(type: "INTEGER", nullable: false, defaultValue: false),
                CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CompositionAttempts", x => x.Id);
                table.ForeignKey(
                    name: "FK_CompositionAttempts_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "CompositionAttemptWords",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                AttemptId = table.Column<int>(type: "INTEGER", nullable: false),
                CardId = table.Column<int>(type: "INTEGER", nullable: true),
                UsedCorrectly = table.Column<bool>(type: "INTEGER", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CompositionAttemptWords", x => x.Id);
                table.ForeignKey(
                    name: "FK_CompositionAttemptWords_Cards_CardId",
                    column: x => x.CardId,
                    principalTable: "Cards",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.SetNull);
                table.ForeignKey(
                    name: "FK_CompositionAttemptWords_CompositionAttempts_AttemptId",
                    column: x => x.AttemptId,
                    principalTable: "CompositionAttempts",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_CompositionAttempts_UserId",
            table: "CompositionAttempts",
            column: "UserId");

        migrationBuilder.CreateIndex(
            name: "IX_CompositionAttemptWords_AttemptId",
            table: "CompositionAttemptWords",
            column: "AttemptId");

        migrationBuilder.CreateIndex(
            name: "IX_CompositionAttemptWords_CardId",
            table: "CompositionAttemptWords",
            column: "CardId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "CompositionAttemptWords");

        migrationBuilder.DropTable(
            name: "CompositionAttempts");
    }
}
