using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260930030000_AddFreeStudyMarks")]
public partial class AddFreeStudyMarks : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "FreeStudyMarks",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                UserId = table.Column<int>(type: "INTEGER", nullable: false),
                CardId = table.Column<int>(type: "INTEGER", nullable: false),
                Knows = table.Column<bool>(type: "INTEGER", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_FreeStudyMarks", x => x.Id);
                table.ForeignKey(
                    name: "FK_FreeStudyMarks_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_FreeStudyMarks_Cards_CardId",
                    column: x => x.CardId,
                    principalTable: "Cards",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_FreeStudyMarks_CardId",
            table: "FreeStudyMarks",
            column: "CardId");

        migrationBuilder.CreateIndex(
            name: "IX_FreeStudyMarks_UserId_CardId",
            table: "FreeStudyMarks",
            columns: new[] { "UserId", "CardId" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "FreeStudyMarks");
    }
}
