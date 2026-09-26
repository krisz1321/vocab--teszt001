using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Models;

#nullable disable

namespace VocabApp.Api.Migrations;

public partial class AddDecks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Decks",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                UserId = table.Column<int>(type: "INTEGER", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Decks", x => x.Id);
                table.ForeignKey(
                    name: "FK_Decks_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Decks_UserId",
            table: "Decks",
            column: "UserId");

        migrationBuilder.AddColumn<int>(
            name: "DeckId",
            table: "Cards",
            type: "INTEGER",
            nullable: true);

        var passwordHash = new PasswordHasher<User>().HashPassword(new User(), "DemoUser1").Replace("'", "''");
        migrationBuilder.Sql(
            $"""
            INSERT INTO "Users" ("Email", "PasswordHash")
            SELECT 'demo@vocab.local', '{passwordHash}'
            WHERE NOT EXISTS (SELECT 1 FROM "Users" WHERE "Email" = 'demo@vocab.local');
            """);
        migrationBuilder.Sql(
            """
            INSERT INTO "Decks" ("Id", "UserId", "Name")
            SELECT 1, "Id", 'Alapcsomag'
            FROM "Users"
            WHERE "Email" = 'demo@vocab.local'
              AND NOT EXISTS (SELECT 1 FROM "Decks" WHERE "Id" = 1);
            """);
        migrationBuilder.Sql(
            """
            INSERT INTO sqlite_sequence ("name", "seq")
            SELECT 'Decks', 1
            WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE "name" = 'Decks');
            """);
        migrationBuilder.Sql(
            """
            UPDATE sqlite_sequence SET "seq" = 1 WHERE "name" = 'Decks' AND "seq" < 1;
            """);
        migrationBuilder.Sql(
            """
            UPDATE "Cards" SET "DeckId" = 1 WHERE "DeckId" IS NULL;
            """);

        migrationBuilder.AlterColumn<int>(
            name: "DeckId",
            table: "Cards",
            type: "INTEGER",
            nullable: false,
            oldClrType: typeof(int),
            oldType: "INTEGER",
            oldNullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_Cards_DeckId",
            table: "Cards",
            column: "DeckId");

        migrationBuilder.AddForeignKey(
            name: "FK_Cards_Decks_DeckId",
            table: "Cards",
            column: "DeckId",
            principalTable: "Decks",
            principalColumn: "Id",
            onDelete: ReferentialAction.Cascade);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_Cards_Decks_DeckId",
            table: "Cards");

        migrationBuilder.DropIndex(
            name: "IX_Cards_DeckId",
            table: "Cards");

        migrationBuilder.DropColumn(
            name: "DeckId",
            table: "Cards");

        migrationBuilder.DropTable(
            name: "Decks");
    }
}
