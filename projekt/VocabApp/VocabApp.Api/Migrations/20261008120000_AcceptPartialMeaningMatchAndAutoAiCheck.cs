using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261008120000_AcceptPartialMeaningMatchAndAutoAiCheck")]
public partial class AcceptPartialMeaningMatchAndAutoAiCheck : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "AcceptPartialMeaningMatch",
            table: "Users",
            type: "INTEGER",
            nullable: false,
            defaultValue: true);

        // Az automatikus MI-ellenőrzés alapból bekapcsolt; a meglévő felhasználóknál is bekapcsoljuk.
        migrationBuilder.Sql("UPDATE \"Users\" SET \"AutomaticAiCheck\" = 1;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "AcceptPartialMeaningMatch",
            table: "Users");
    }
}
