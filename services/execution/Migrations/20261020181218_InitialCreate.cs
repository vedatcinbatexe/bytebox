using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Execution.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "runs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Language = table.Column<string>(type: "text", nullable: false),
                    EntryFile = table.Column<string>(type: "text", nullable: false),
                    Stdin = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    ExitCode = table.Column<int>(type: "integer", nullable: true),
                    Stdout = table.Column<string>(type: "text", nullable: false),
                    Stderr = table.Column<string>(type: "text", nullable: false),
                    Truncated = table.Column<bool>(type: "boolean", nullable: false),
                    TimeMs = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FinishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Files = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_runs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_runs_CreatedAt",
                table: "runs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_runs_UserId",
                table: "runs",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "runs");
        }
    }
}
