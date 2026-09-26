using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VocabApp.Api.Models;

namespace VocabApp.Api.Data;

public static class BaseUserSeed
{
    private static readonly DateTime SeedDate = new(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static async Task EnsureAsync(
        AppDbContext dbContext,
        IPasswordHasher<User> passwordHasher,
        CancellationToken cancellationToken = default)
    {
        await EnsureUserAsync(
            dbContext,
            passwordHasher,
            "demo@vocab.local",
            "DemoUser1",
            [
                new SeedDeck("Alapcsomag",
                [
                    new("serendipity", "The chance occurrence of a pleasant or useful discovery.", "Finding that quiet bookshop was pure serendipity."),
                    new("resilient", "Able to recover quickly from difficulty or change.", "The resilient team adapted after the setback."),
                    new("ubiquitous", "Present or seeming to be present everywhere.", "Smartphones have become ubiquitous in daily life."),
                    new("concise", "Giving much information clearly in very few words.", "Her concise summary captured every important point."),
                    new("empathy", "The ability to understand and share another person's feelings.", "Good mentors listen with patience and empathy."),
                    new("diligent", "Showing careful and persistent effort in work or study.", "A diligent student reviews notes every evening."),
                    new("ambiguous", "Open to more than one interpretation; not clearly defined.", "The contract clause was too ambiguous to enforce."),
                    new("pragmatic", "Dealing with problems in a practical, realistic way.", "She took a pragmatic approach and fixed the most urgent issue first."),
                    new("reluctant", "Unwilling or hesitant to do something.", "He was reluctant to speak in front of the class."),
                    new("substantial", "Of considerable importance, size, or worth.", "The project needs a substantial amount of extra time."),
                    new("feasible", "Possible and practical to do successfully.", "Building a small prototype first is a feasible plan."),
                    new("candid", "Honest and direct, even when the truth is uncomfortable.", "Please be candid about what still does not work."),
                    new("persist", "Continue firmly despite difficulty or opposition.", "If you persist with daily practice, the words will stick."),
                    new("versatile", "Able to adapt to many different functions or activities.", "English is a versatile skill across many careers."),
                    new("meticulous", "Showing great attention to detail; very careful and precise.", "Her meticulous notes made revision much easier.")
                ]),
                new SeedDeck("Alap szavak",
                [
                    new("hello", "A word you say when you meet someone.", "She said hello to her neighbor."),
                    new("water", "The clear liquid that people drink.", "I drink water in the morning."),
                    new("book", "Pages with writing that you can read.", "This book is easy to read."),
                    new("friend", "A person you like and know well.", "My friend sits next to me."),
                    new("house", "A building where people live.", "Their house is near the school."),
                    new("time", "Hours and minutes that a clock shows.", "We have time to eat."),
                    new("food", "Things that people and animals eat.", "The food is on the table."),
                    new("school", "A place where students learn.", "School starts at eight."),
                    new("happy", "Feeling glad and pleased.", "I am happy to see you."),
                    new("small", "Not big.", "The cat is small.")
                ])
            ],
            cancellationToken);

        await EnsureUserAsync(
            dbContext,
            passwordHasher,
            "second@vocab.local",
            "SecondUser1",
            [
                new SeedDeck("Egyszerű szavak",
                [
                    new("cat", "A small animal that people keep at home.", "The cat sleeps on the chair."),
                    new("sun", "The bright star we see in the day.", "The sun is warm today."),
                    new("tree", "A tall plant with a trunk and leaves.", "The tree is in the garden."),
                    new("bread", "Food made from flour and baked.", "I eat bread with butter."),
                    new("blue", "The color of a clear sky.", "The sky is blue.")
                ])
            ],
            cancellationToken);
    }

    private static async Task EnsureUserAsync(
        AppDbContext dbContext,
        IPasswordHasher<User> passwordHasher,
        string email,
        string password,
        IReadOnlyList<SeedDeck> decks,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .Include(candidate => candidate.Decks)
            .ThenInclude(deck => deck.Cards)
            .FirstOrDefaultAsync(candidate => candidate.Email == email, cancellationToken);

        if (user is null)
        {
            user = new User { Email = email };
            user.PasswordHash = passwordHasher.HashPassword(user, password);
            dbContext.Users.Add(user);
        }

        foreach (var seedDeck in decks)
        {
            var deck = user.Decks.FirstOrDefault(candidate => candidate.Name == seedDeck.Name);
            if (deck is null)
            {
                deck = new Deck { Name = seedDeck.Name, IsPublic = false, User = user };
                user.Decks.Add(deck);
            }

            foreach (var seedCard in seedDeck.Cards)
            {
                if (deck.Cards.Any(card => card.Term == seedCard.Term))
                {
                    continue;
                }

                deck.Cards.Add(new Card
                {
                    Term = seedCard.Term,
                    Definition = seedCard.Definition,
                    Example = seedCard.Example,
                    Progress = new CardProgress
                    {
                        NextReviewDate = SeedDate,
                        EaseFactor = 2.5f,
                        Interval = 0,
                        Streak = 0,
                        IncorrectCount = 0
                    }
                });
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private sealed record SeedDeck(string Name, IReadOnlyList<SeedCard> Cards);

    private sealed record SeedCard(string Term, string Definition, string Example);
}
