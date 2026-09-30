using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260930020000_AddAiCallCount")]
public partial class AddAiCallCount : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "AiCallCount",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: 0);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "AiCallCount",
            table: "Users");
    }
}
