using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260925041000_AddBasicDeck")]
public partial class AddBasicDeck : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            INSERT INTO "Decks" ("UserId", "Name")
            SELECT "Id", 'Alap szavak'
            FROM "Users"
            WHERE "Email" = 'demo@vocab.local'
              AND NOT EXISTS (
                SELECT 1 FROM "Decks"
                WHERE "UserId" = "Users"."Id" AND "Name" = 'Alap szavak');
            """);

        InsertCard(migrationBuilder, "hello", "A word you say when you meet someone.", "She said hello to her neighbor.");
        InsertCard(migrationBuilder, "water", "The clear liquid that people drink.", "I drink water in the morning.");
        InsertCard(migrationBuilder, "book", "Pages with writing that you can read.", "This book is easy to read.");
        InsertCard(migrationBuilder, "friend", "A person you like and know well.", "My friend sits next to me.");
        InsertCard(migrationBuilder, "house", "A building where people live.", "Their house is near the school.");
        InsertCard(migrationBuilder, "time", "Hours and minutes that a clock shows.", "We have time to eat.");
        InsertCard(migrationBuilder, "food", "Things that people and animals eat.", "The food is on the table.");
        InsertCard(migrationBuilder, "school", "A place where students learn.", "School starts at eight.");
        InsertCard(migrationBuilder, "happy", "Feeling glad and pleased.", "I am happy to see you.");
        InsertCard(migrationBuilder, "small", "Not big.", "The cat is small.");

        migrationBuilder.Sql(
            """
            INSERT INTO "CardProgresses" ("CardId", "NextReviewDate", "EaseFactor", "Interval", "Streak", "IncorrectCount")
            SELECT "Cards"."Id", '2024-01-01 00:00:00', 2.5, 0, 0, 0
            FROM "Cards"
            INNER JOIN "Decks" ON "Decks"."Id" = "Cards"."DeckId"
            INNER JOIN "Users" ON "Users"."Id" = "Decks"."UserId"
            WHERE "Users"."Email" = 'demo@vocab.local'
              AND "Decks"."Name" = 'Alap szavak'
              AND NOT EXISTS (
                SELECT 1 FROM "CardProgresses" WHERE "CardProgresses"."CardId" = "Cards"."Id");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            DELETE FROM "Decks"
            WHERE "Name" = 'Alap szavak'
              AND "UserId" IN (SELECT "Id" FROM "Users" WHERE "Email" = 'demo@vocab.local');
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
            WHERE "Users"."Email" = 'demo@vocab.local'
              AND "Decks"."Name" = 'Alap szavak'
              AND NOT EXISTS (
                SELECT 1 FROM "Cards"
                WHERE "Cards"."DeckId" = "Decks"."Id" AND "Cards"."Term" = '{term}');
            """);
    }
}
