using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260929020000_AddSavedDefinitions")]
public partial class AddSavedDefinitions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "GenerateAlternateDefinitions",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: true);

        migrationBuilder.CreateTable(
            name: "SavedDefinitions",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                TermKey = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                Level = table.Column<string>(type: "TEXT", maxLength: 2, nullable: false),
                Definition = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_SavedDefinitions", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_SavedDefinitions_TermKey_Level_Definition",
            table: "SavedDefinitions",
            columns: new[] { "TermKey", "Level", "Definition" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "SavedDefinitions");

        migrationBuilder.DropColumn(
            name: "GenerateAlternateDefinitions",
            table: "Users");
    }
}
