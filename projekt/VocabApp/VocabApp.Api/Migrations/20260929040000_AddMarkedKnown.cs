using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260929040000_AddMarkedKnown")]
public partial class AddMarkedKnown : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "MarkedKnown",
            table: "CardProgresses",
            type: "INTEGER",
            nullable: false,
            defaultValue: false);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "MarkedKnown",
            table: "CardProgresses");
    }
}
