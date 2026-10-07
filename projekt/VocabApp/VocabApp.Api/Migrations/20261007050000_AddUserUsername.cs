using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261007050000_AddUserUsername")]
public partial class AddUserUsername : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Username",
            table: "Users",
            type: "TEXT",
            maxLength: 30,
            nullable: false,
            defaultValue: "",
            collation: "NOCASE");

        // A meglévő felhasználók egyedi nevet kapnak (az alap demo fiókok beszédes nevet), amit a profilban átírhatnak.
        migrationBuilder.Sql("""UPDATE "Users" SET "Username" = 'user' || "Id";""");
        migrationBuilder.Sql("""UPDATE "Users" SET "Username" = 'demo' WHERE "Email" = 'demo@vocab.local';""");
        migrationBuilder.Sql("""UPDATE "Users" SET "Username" = 'second' WHERE "Email" = 'second@vocab.local';""");

        migrationBuilder.CreateIndex(
            name: "IX_Users_Username",
            table: "Users",
            column: "Username",
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_Users_Username",
            table: "Users");

        migrationBuilder.DropColumn(
            name: "Username",
            table: "Users");
    }
}
