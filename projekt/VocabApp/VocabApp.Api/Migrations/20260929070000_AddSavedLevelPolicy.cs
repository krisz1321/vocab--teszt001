using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260929070000_AddSavedLevelPolicy")]
public partial class AddSavedLevelPolicy : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "SavedLevelPolicy",
            table: "Users",
            type: "TEXT",
            maxLength: 16,
            nullable: false,
            defaultValue: "exact");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "SavedLevelPolicy",
            table: "Users");
    }
}
