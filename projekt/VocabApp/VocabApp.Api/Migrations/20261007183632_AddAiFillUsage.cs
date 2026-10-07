using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocabApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAiFillUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AiFillBatchSize",
                table: "Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: 5);

            migrationBuilder.CreateTable(
                name: "UserAiFillDays",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    Day = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Count = table.Column<int>(type: "INTEGER", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserAiFillDays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserAiFillDays_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserAiFillDays_UserId_Day",
                table: "UserAiFillDays",
                columns: new[] { "UserId", "Day" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserAiFillDays");

            migrationBuilder.DropColumn(
                name: "AiFillBatchSize",
                table: "Users");
        }
    }
}
