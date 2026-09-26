using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;
using VocabApp.Api.Models;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260925070000_AddSecondUser")]
public partial class AddSecondUser : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        var passwordHash = new PasswordHasher<User>().HashPassword(new User(), "SecondUser1").Replace("'", "''");
        migrationBuilder.Sql(
            $"""
            INSERT INTO "Users" ("Email", "PasswordHash")
            SELECT 'second@vocab.local', '{passwordHash}'
            WHERE NOT EXISTS (SELECT 1 FROM "Users" WHERE "Email" = 'second@vocab.local');
            """);

        migrationBuilder.Sql(
            """
            INSERT INTO "Decks" ("UserId", "Name", "IsPublic")
            SELECT "Id", 'Egyszerű szavak', 0
            FROM "Users"
            WHERE "Email" = 'second@vocab.local'
              AND NOT EXISTS (
                SELECT 1 FROM "Decks"
                WHERE "UserId" = "Users"."Id" AND "Name" = 'Egyszerű szavak');
            """);

        InsertCard(migrationBuilder, "cat", "A small animal that people keep at home.", "The cat sleeps on the chair.");
        InsertCard(migrationBuilder, "sun", "The bright star we see in the day.", "The sun is warm today.");
        InsertCard(migrationBuilder, "tree", "A tall plant with a trunk and leaves.", "The tree is in the garden.");
        InsertCard(migrationBuilder, "bread", "Food made from flour and baked.", "I eat bread with butter.");
        InsertCard(migrationBuilder, "blue", "The color of a clear sky.", "The sky is blue.");

        migrationBuilder.Sql(
            """
            INSERT INTO "CardProgresses" ("CardId", "NextReviewDate", "EaseFactor", "Interval", "Streak", "IncorrectCount")
            SELECT "Cards"."Id", '2024-01-01 00:00:00', 2.5, 0, 0, 0
            FROM "Cards"
            INNER JOIN "Decks" ON "Decks"."Id" = "Cards"."DeckId"
            INNER JOIN "Users" ON "Users"."Id" = "Decks"."UserId"
            WHERE "Users"."Email" = 'second@vocab.local'
              AND "Decks"."Name" = 'Egyszerű szavak'
              AND NOT EXISTS (
                SELECT 1 FROM "CardProgresses" WHERE "CardProgresses"."CardId" = "Cards"."Id");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DELETE FROM "Users" WHERE "Email" = 'second@vocab.local';
            """);
    }

    private static void InsertCard(MigrationBuilder migrationBuilder, string term, string definition, string example)
    {
        migrationBuilder.Sql(
            $"""
            INSERT INTO "Cards" ("Term", "Definition", "Example", "DeckId")
            SELECT '{term}', '{definition}', '{example}', "Decks"."Id"
            FROM "Decks"
            INNER JOIN "Users" ON "Users"."Id" = "Decks"."UserId"
            WHERE "Users"."Email" = 'second@vocab.local'
              AND "Decks"."Name" = 'Egyszerű szavak'
              AND NOT EXISTS (
                SELECT 1 FROM "Cards"
                WHERE "Cards"."Term" = '{term}');
            """);
    }
}
