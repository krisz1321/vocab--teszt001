using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocabApp.Api.Data;

#nullable disable

namespace VocabApp.Api.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260926020000_AddCardConfusions")]
public partial class AddCardConfusions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CardConfusions",
            columns: table => new
            {
                Id = table.Column<int>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                UserId = table.Column<int>(type: "INTEGER", nullable: false),
                CardId = table.Column<int>(type: "INTEGER", nullable: false),
                ConfusedWithCardId = table.Column<int>(type: "INTEGER", nullable: false),
                Count = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 1),
                LastConfusedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CardConfusions", x => x.Id);
                table.ForeignKey(
                    name: "FK_CardConfusions_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_CardConfusions_Cards_CardId",
                    column: x => x.CardId,
                    principalTable: "Cards",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_CardConfusions_Cards_ConfusedWithCardId",
                    column: x => x.ConfusedWithCardId,
                    principalTable: "Cards",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_CardConfusions_CardId",
            table: "CardConfusions",
            column: "CardId");

        migrationBuilder.CreateIndex(
            name: "IX_CardConfusions_ConfusedWithCardId",
            table: "CardConfusions",
            column: "ConfusedWithCardId");

        migrationBuilder.CreateIndex(
            name: "IX_CardConfusions_UserId_CardId_ConfusedWithCardId",
            table: "CardConfusions",
            columns: new[] { "UserId", "CardId", "ConfusedWithCardId" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "CardConfusions");
    }
}
