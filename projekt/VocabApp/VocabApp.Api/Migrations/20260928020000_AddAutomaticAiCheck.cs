using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260928020000_AddAutomaticAiCheck")]
public partial class AddAutomaticAiCheck : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "AutomaticAiCheck",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: false);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "AutomaticAiCheck",
            table: "Users");
    }
}
