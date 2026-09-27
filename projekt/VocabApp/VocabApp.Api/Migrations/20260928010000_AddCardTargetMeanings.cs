using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260928010000_AddCardTargetMeanings")]
public partial class AddCardTargetMeanings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "TargetMeanings",
            table: "Cards",
            type: "TEXT",
            maxLength: 200,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "TargetMeanings",
            table: "Cards");
    }
}
