using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261007060000_AddDeckSharingSnapshots")]
public partial class AddDeckSharingSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "SharedDecks",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                OwnerId = table.Column<int>(type: "INTEGER", nullable: false),
                SourceDeckId = table.Column<int>(type: "INTEGER", nullable: false),
                Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                ExampleLevel = table.Column<string>(type: "TEXT", maxLength: 2, nullable: true),
                Version = table.Column<int>(type: "INTEGER", nullable: false),
                SharedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                ContentHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SharedDecks", x => x.Id);
                table.ForeignKey(
                    name: "FK_SharedDecks_Users_OwnerId",
                    column: x => x.OwnerId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_SharedDecks_Decks_SourceDeckId",
                    column: x => x.SourceDeckId,
                    principalTable: "Decks",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "SharedDeckCards",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                SharedDeckId = table.Column<int>(type: "INTEGER", nullable: false),
                Term = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                Definition = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                Example = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                TargetMeanings = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                Tags = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SharedDeckCards", x => x.Id);
                table.ForeignKey(
                    name: "FK_SharedDeckCards_SharedDecks_SharedDeckId",
                    column: x => x.SharedDeckId,
                    principalTable: "SharedDecks",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "SharedDeckSaves",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                SharedDeckId = table.Column<int>(type: "INTEGER", nullable: false),
                UserId = table.Column<int>(type: "INTEGER", nullable: false),
                FirstSavedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                LastSavedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SharedDeckSaves", x => x.Id);
                table.ForeignKey(
                    name: "FK_SharedDeckSaves_SharedDecks_SharedDeckId",
                    column: x => x.SharedDeckId,
                    principalTable: "SharedDecks",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_SharedDeckSaves_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_SharedDecks_OwnerId",
            table: "SharedDecks",
            column: "OwnerId");

        migrationBuilder.CreateIndex(
            name: "IX_SharedDecks_SourceDeckId",
            table: "SharedDecks",
            column: "SourceDeckId",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_SharedDeckCards_SharedDeckId",
            table: "SharedDeckCards",
            column: "SharedDeckId");

        migrationBuilder.CreateIndex(
            name: "IX_SharedDeckSaves_SharedDeckId_UserId",
            table: "SharedDeckSaves",
            columns: ["SharedDeckId", "UserId"],
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_SharedDeckSaves_UserId",
            table: "SharedDeckSaves",
            column: "UserId");

        // SQLite-ban idegen kulcsos oszlopot csak az ADD COLUMN utasítás REFERENCES tagmondatával lehet
        // utólag felvenni (az AddForeignKey táblaújraépítést kérne, amihez a kézi migrációnak nincs modellje).
        migrationBuilder.Sql(
            """
            ALTER TABLE "Decks"
            ADD COLUMN "SourceSharedDeckId" INTEGER NULL REFERENCES "SharedDecks" ("Id") ON DELETE SET NULL;
            """);

        migrationBuilder.AddColumn<int>(
            name: "SourceVersion",
            table: "Decks",
            type: "INTEGER",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_Decks_SourceSharedDeckId",
            table: "Decks",
            column: "SourceSharedDeckId");

        // A korábban megosztott (IsPublic) paklik v1-es pillanatképként átkerülnek az új táblákba.
        // A ContentHash üres marad, az API indulásakor számolódik ki a közzétett tartalomból.
        migrationBuilder.Sql(
            """
            INSERT INTO "SharedDecks"
                ("OwnerId", "SourceDeckId", "Name", "Description", "ExampleLevel", "Version", "SharedAt", "UpdatedAt", "IsActive", "ContentHash")
            SELECT "UserId", "Id", "Name", "Description", "ExampleLevel", 1, datetime('now'), datetime('now'), 1, ''
            FROM "Decks"
            WHERE "IsPublic" = 1;
            """);

        migrationBuilder.Sql(
            """
            INSERT INTO "SharedDeckCards" ("SharedDeckId", "Term", "Definition", "Example", "TargetMeanings", "Tags")
            SELECT s."Id", c."Term", c."Definition", c."Example", c."TargetMeanings", c."Tags"
            FROM "SharedDecks" AS s
            INNER JOIN "Cards" AS c ON c."DeckId" = s."SourceDeckId"
            ORDER BY s."Id", c."Id";
            """);

        // A megosztottságot ezentúl a SharedDecks.IsActive jelzi.
        migrationBuilder.Sql("""ALTER TABLE "Decks" DROP COLUMN "IsPublic";""");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Az SQLite nem tud idegen kulcsos oszlopot törölni (Decks.SourceSharedDeckId), ezért a visszavonás
        // csak az adatbázis újraépítésével (vagy mentésből való visszaállítással) lehetséges.
        throw new NotSupportedException(
            "Az AddDeckSharingSnapshots migráció SQLite-on nem vonható vissza; állítsd vissza az adatbázis mentését.");
    }
}
