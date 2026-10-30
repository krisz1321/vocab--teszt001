using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocabApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AiCaches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PromptHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ResponseText = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiCaches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SavedDefinitions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TermKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Level = table.Column<string>(type: "nvarchar(2)", maxLength: 2, nullable: false),
                    Definition = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SavedExamples",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TermKey = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DefinitionKey = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Level = table.Column<string>(type: "nvarchar(2)", maxLength: 2, nullable: false, defaultValue: "B1"),
                    Sentence = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    KeyHash = table.Column<byte[]>(type: "varbinary(32)", maxLength: 32, nullable: false, computedColumnSql: "CONVERT(binary(32), HASHBYTES('SHA2_256', [TermKey] + N'|' + [DefinitionKey] + N'|' + [Level] + N'|' + [Sentence]))", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedExamples", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Username = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    DailyNewCardGoal = table.Column<int>(type: "int", nullable: false, defaultValue: 20),
                    MinimumAnswerSeconds = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    AutomaticAiCheck = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    AcceptHungarianParaphrase = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    AcceptPartialMeaningMatch = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    AcceptEnglishSynonyms = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RepeatMistakes = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    RequireAppealReason = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    ReuseSavedExamples = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    SavedLevelPolicy = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false, defaultValue: "exact"),
                    GenerateAlternateDefinitions = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    LeechThreshold = table.Column<int>(type: "int", nullable: false, defaultValue: 6),
                    ExampleLevel = table.Column<string>(type: "nvarchar(2)", maxLength: 2, nullable: false, defaultValue: "B1"),
                    AiModel = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false, defaultValue: "google/gemini-3.6-flash"),
                    TimeZoneId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false, defaultValue: "Europe/Budapest"),
                    AiFillBatchSize = table.Column<int>(type: "int", nullable: false, defaultValue: 5),
                    SelectedGrammarTenses = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false, defaultValue: "present_simple,past_simple"),
                    GrammarShowTranslation = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    StudyDayStreak = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    LongestStudyDayStreak = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    AiCallCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    LastStudyDate = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                    table.CheckConstraint("CK_Users_DailyNewCardGoal", "DailyNewCardGoal >= 0 AND DailyNewCardGoal <= 100");
                    table.CheckConstraint("CK_Users_MinimumAnswerSeconds", "MinimumAnswerSeconds >= 0 AND MinimumAnswerSeconds <= 120");
                });

            migrationBuilder.CreateTable(
                name: "CompositionAttempts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    IsCorrect = table.Column<bool>(type: "bit", nullable: false),
                    GrammarCorrect = table.Column<bool>(type: "bit", nullable: false),
                    Coherent = table.Column<bool>(type: "bit", nullable: false),
                    ManuallyAccepted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompositionAttempts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompositionAttempts_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserAiFillDays",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    Day = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Count = table.Column<int>(type: "int", nullable: false, defaultValue: 0)
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

            migrationBuilder.CreateTable(
                name: "UserStudyDays",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    DayUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SecondsStudied = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    AnswerCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    CorrectCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    IncorrectCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserStudyDays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserStudyDays_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CardConfusions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    CardId = table.Column<int>(type: "int", nullable: false),
                    ConfusedWithCardId = table.Column<int>(type: "int", nullable: false),
                    Count = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    LastConfusedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardConfusions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CardConfusions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CardProgresses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CardId = table.Column<int>(type: "int", nullable: false),
                    NextReviewDate = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "SYSUTCDATETIME()"),
                    EaseFactor = table.Column<float>(type: "real", nullable: false, defaultValue: 2.5f),
                    Interval = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    Streak = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    IncorrectCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    CorrectCount = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    FirstReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LearnedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    MarkedKnown = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    SuspendedUntil = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardProgresses", x => x.Id);
                    table.CheckConstraint("CK_CardProgress_EaseFactor", "EaseFactor > 0");
                    table.CheckConstraint("CK_CardProgress_IncorrectCount", "IncorrectCount >= 0");
                    table.CheckConstraint("CK_CardProgress_Interval", "Interval >= 0");
                    table.CheckConstraint("CK_CardProgress_Streak", "Streak >= 0");
                });

            migrationBuilder.CreateTable(
                name: "Cards",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Term = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Definition = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Example = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    TargetMeanings = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Tags = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    DeckId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cards", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CompositionAttemptWords",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AttemptId = table.Column<int>(type: "int", nullable: false),
                    CardId = table.Column<int>(type: "int", nullable: true),
                    UsedCorrectly = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompositionAttemptWords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompositionAttemptWords_Cards_CardId",
                        column: x => x.CardId,
                        principalTable: "Cards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_CompositionAttemptWords_CompositionAttempts_AttemptId",
                        column: x => x.AttemptId,
                        principalTable: "CompositionAttempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FreeStudyMarks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    CardId = table.Column<int>(type: "int", nullable: false),
                    Knows = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FreeStudyMarks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FreeStudyMarks_Cards_CardId",
                        column: x => x.CardId,
                        principalTable: "Cards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FreeStudyMarks_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "GrammarAttempts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    CardId = table.Column<int>(type: "int", nullable: true),
                    Tense = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    IsCorrect = table.Column<bool>(type: "bit", nullable: false),
                    TermUsedCorrectly = table.Column<bool>(type: "bit", nullable: false),
                    TenseCorrect = table.Column<bool>(type: "bit", nullable: false),
                    GrammarCorrect = table.Column<bool>(type: "bit", nullable: false),
                    ManuallyAccepted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GrammarAttempts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GrammarAttempts_Cards_CardId",
                        column: x => x.CardId,
                        principalTable: "Cards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_GrammarAttempts_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Decks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ExampleLevel = table.Column<string>(type: "nvarchar(2)", maxLength: 2, nullable: true),
                    SourceSharedDeckId = table.Column<int>(type: "int", nullable: true),
                    SourceVersion = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Decks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Decks_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SharedDecks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    OwnerId = table.Column<int>(type: "int", nullable: false),
                    SourceDeckId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ExampleLevel = table.Column<string>(type: "nvarchar(2)", maxLength: 2, nullable: true),
                    Version = table.Column<int>(type: "int", nullable: false),
                    SharedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    ContentHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SharedDecks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SharedDecks_Decks_SourceDeckId",
                        column: x => x.SourceDeckId,
                        principalTable: "Decks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SharedDecks_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SharedDeckCards",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SharedDeckId = table.Column<int>(type: "int", nullable: false),
                    Term = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Definition = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Example = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    TargetMeanings = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    Tags = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SharedDeckCards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SharedDeckCards_SharedDecks_SharedDeckId",
                        column: x => x.SharedDeckId,
                        principalTable: "SharedDecks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SharedDeckSaves",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SharedDeckId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    FirstSavedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastSavedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SharedDeckSaves", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SharedDeckSaves_SharedDecks_SharedDeckId",
                        column: x => x.SharedDeckId,
                        principalTable: "SharedDecks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SharedDeckSaves_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiCaches_PromptHash",
                table: "AiCaches",
                column: "PromptHash",
                unique: true);

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

            migrationBuilder.CreateIndex(
                name: "IX_CardProgresses_CardId",
                table: "CardProgresses",
                column: "CardId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Cards_DeckId",
                table: "Cards",
                column: "DeckId");

            migrationBuilder.CreateIndex(
                name: "IX_CompositionAttempts_UserId",
                table: "CompositionAttempts",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CompositionAttemptWords_AttemptId",
                table: "CompositionAttemptWords",
                column: "AttemptId");

            migrationBuilder.CreateIndex(
                name: "IX_CompositionAttemptWords_CardId",
                table: "CompositionAttemptWords",
                column: "CardId");

            migrationBuilder.CreateIndex(
                name: "IX_Decks_SourceSharedDeckId",
                table: "Decks",
                column: "SourceSharedDeckId");

            migrationBuilder.CreateIndex(
                name: "IX_Decks_UserId",
                table: "Decks",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_FreeStudyMarks_CardId",
                table: "FreeStudyMarks",
                column: "CardId");

            migrationBuilder.CreateIndex(
                name: "IX_FreeStudyMarks_UserId_CardId",
                table: "FreeStudyMarks",
                columns: new[] { "UserId", "CardId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GrammarAttempts_CardId",
                table: "GrammarAttempts",
                column: "CardId");

            migrationBuilder.CreateIndex(
                name: "IX_GrammarAttempts_UserId_Tense",
                table: "GrammarAttempts",
                columns: new[] { "UserId", "Tense" });

            migrationBuilder.CreateIndex(
                name: "IX_SavedDefinitions_TermKey_Level_Definition",
                table: "SavedDefinitions",
                columns: new[] { "TermKey", "Level", "Definition" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SavedExamples_KeyHash",
                table: "SavedExamples",
                column: "KeyHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SavedExamples_TermKey_DefinitionKey",
                table: "SavedExamples",
                columns: new[] { "TermKey", "DefinitionKey" });

            migrationBuilder.CreateIndex(
                name: "IX_SharedDeckCards_SharedDeckId",
                table: "SharedDeckCards",
                column: "SharedDeckId");

            migrationBuilder.CreateIndex(
                name: "IX_SharedDecks_OwnerId",
                table: "SharedDecks",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_SharedDecks_SourceDeckId",
                table: "SharedDecks",
                column: "SourceDeckId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SharedDeckSaves_SharedDeckId_UserId",
                table: "SharedDeckSaves",
                columns: new[] { "SharedDeckId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SharedDeckSaves_UserId",
                table: "SharedDeckSaves",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserAiFillDays_UserId_Day",
                table: "UserAiFillDays",
                columns: new[] { "UserId", "Day" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserStudyDays_UserId_DayUtc",
                table: "UserStudyDays",
                columns: new[] { "UserId", "DayUtc" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CardConfusions_Cards_CardId",
                table: "CardConfusions",
                column: "CardId",
                principalTable: "Cards",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_CardConfusions_Cards_ConfusedWithCardId",
                table: "CardConfusions",
                column: "ConfusedWithCardId",
                principalTable: "Cards",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_CardProgresses_Cards_CardId",
                table: "CardProgresses",
                column: "CardId",
                principalTable: "Cards",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Cards_Decks_DeckId",
                table: "Cards",
                column: "DeckId",
                principalTable: "Decks",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Decks_SharedDecks_SourceSharedDeckId",
                table: "Decks",
                column: "SourceSharedDeckId",
                principalTable: "SharedDecks",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Decks_Users_UserId",
                table: "Decks");

            migrationBuilder.DropForeignKey(
                name: "FK_SharedDecks_Users_OwnerId",
                table: "SharedDecks");

            migrationBuilder.DropForeignKey(
                name: "FK_SharedDecks_Decks_SourceDeckId",
                table: "SharedDecks");

            migrationBuilder.DropTable(
                name: "AiCaches");

            migrationBuilder.DropTable(
                name: "CardConfusions");

            migrationBuilder.DropTable(
                name: "CardProgresses");

            migrationBuilder.DropTable(
                name: "CompositionAttemptWords");

            migrationBuilder.DropTable(
                name: "FreeStudyMarks");

            migrationBuilder.DropTable(
                name: "GrammarAttempts");

            migrationBuilder.DropTable(
                name: "SavedDefinitions");

            migrationBuilder.DropTable(
                name: "SavedExamples");

            migrationBuilder.DropTable(
                name: "SharedDeckCards");

            migrationBuilder.DropTable(
                name: "SharedDeckSaves");

            migrationBuilder.DropTable(
                name: "UserAiFillDays");

            migrationBuilder.DropTable(
                name: "UserStudyDays");

            migrationBuilder.DropTable(
                name: "CompositionAttempts");

            migrationBuilder.DropTable(
                name: "Cards");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Decks");

            migrationBuilder.DropTable(
                name: "SharedDecks");
        }
    }
}
