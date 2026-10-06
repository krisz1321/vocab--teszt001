using System.Text;
using System.Text.RegularExpressions;

namespace VocabApp.Api.Services;

public sealed class DeckCsvFile
{
    public required string FileName { get; init; }

    public required string Content { get; init; }
}

public readonly record struct DeckCsvRow(string Term, string Definition, string? Example, string? TargetMeanings);

public static partial class DeckCsv
{
    public const string Header = "term,definition,example";
    public const string HeaderWithTargetMeanings = "term,definition,example,targetMeanings";
    public const int MaxDataRows = 200;
    private const int MaxTermLength = 100;
    private const int MaxTextLength = 500;
    private const int MaxTargetMeaningsLength = 200;
    private const string HeaderError =
        "A CSV fejléce term,definition,example vagy term,definition,example,targetMeanings legyen.";

    public static string ToFileName(string deckName)
    {
        var slug = NonNameCharacters().Replace(deckName.Trim(), "-").Trim('-');
        if (string.IsNullOrEmpty(slug))
        {
            slug = "pakli";
        }

        return slug + ".csv";
    }

    public static string Write(IEnumerable<DeckCsvRow> rows)
    {
        var builder = new StringBuilder(HeaderWithTargetMeanings);
        foreach (var row in rows)
        {
            builder.Append('\n');
            builder.Append(Quote(row.Term));
            builder.Append(',');
            builder.Append(Quote(row.Definition));
            builder.Append(',');
            builder.Append(Quote(row.Example));
            builder.Append(',');
            builder.Append(Quote(row.TargetMeanings));
        }

        return builder.ToString();
    }

    public static bool TryRead(string? csv, out List<DeckCsvRow> rows, out List<string> skipped, out string? error)
    {
        rows = [];
        skipped = [];
        error = null;

        if (string.IsNullOrWhiteSpace(csv))
        {
            error = HeaderError;
            return false;
        }

        var text = csv[0] == '\uFEFF' ? csv[1..] : csv;
        if (!TrySplitRecords(text, out var records, out error))
        {
            return false;
        }

        var contentRecords = records.Where(record => !string.IsNullOrWhiteSpace(record)).ToList();
        if (contentRecords.Count == 0)
        {
            error = HeaderError;
            return false;
        }

        var includeTargetMeanings = contentRecords[0] == HeaderWithTargetMeanings;
        if (contentRecords[0] != Header && !includeTargetMeanings)
        {
            error = HeaderError;
            return false;
        }

        var dataRecords = contentRecords.Skip(1).ToList();
        if (dataRecords.Count > MaxDataRows)
        {
            error = "A CSV legfeljebb 200 adatsort tartalmazhat.";
            return false;
        }

        // A hibás sor nem buktatja meg az egész importot: kimarad, és a hibája a skipped listába kerül.
        for (var index = 0; index < dataRecords.Count; index++)
        {
            if (!TryParseRow(dataRecords[index], index + 1, includeTargetMeanings, out var row, out var rowError))
            {
                skipped.Add(rowError ?? $"CSV {index + 1}. sor: érvénytelen sor.");
                continue;
            }

            rows.Add(row);
        }

        return true;
    }

    private static string Quote(string? value)
    {
        var text = NeutralizeFormula(value ?? string.Empty);
        return "\"" + text.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
    }

    // Az Excel és a LibreOffice a "=", "+", "@" (és a számként kezdődő "-") jellel induló cellát
    // képletként értelmezi, ezért ezek elé aposztróf kerül. Az import ezt visszacsinálja.
    private static bool StartsLikeFormula(string text)
    {
        if (text.Length == 0)
        {
            return false;
        }

        var first = text[0];
        if (first is '=' or '+' or '@' or '\t' or '\r')
        {
            return true;
        }

        return first == '-' && (text.Length == 1 || !char.IsLetter(text[1]));
    }

    private static string NeutralizeFormula(string text)
    {
        return StartsLikeFormula(text) ? "'" + text : text;
    }

    private static string RestoreFormula(string text)
    {
        return text.Length > 1 && text[0] == '\'' && StartsLikeFormula(text[1..]) ? text[1..] : text;
    }

    private static bool TrySplitRecords(string text, out List<string> records, out string? error)
    {
        records = [];
        error = null;
        var current = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < text.Length; i++)
        {
            var character = text[i];
            if (character == '"')
            {
                current.Append(character);
                if (inQuotes && i + 1 < text.Length && text[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }

                continue;
            }

            if (!inQuotes && (character == '\n' || character == '\r'))
            {
                if (character == '\r' && i + 1 < text.Length && text[i + 1] == '\n')
                {
                    i++;
                }

                records.Add(current.ToString());
                current.Clear();
                continue;
            }

            current.Append(character);
        }

        if (inQuotes)
        {
            error = "A CSV fájl érvénytelen.";
            records = [];
            return false;
        }

        records.Add(current.ToString());
        return true;
    }

    private static bool TryParseRow(
        string record,
        int rowNumber,
        bool includeTargetMeanings,
        out DeckCsvRow row,
        out string? error)
    {
        row = default;
        if (!TryParseFields(record, out var fields, out _))
        {
            error = $"CSV {rowNumber}. sor: érvénytelen idézőjelezés.";
            return false;
        }

        var expectedCount = includeTargetMeanings ? 4 : 3;
        if (fields.Count != expectedCount)
        {
            error = includeTargetMeanings
                ? $"CSV {rowNumber}. sor: négy oszlop kell: term, definition, example, targetMeanings."
                : $"CSV {rowNumber}. sor: három oszlop kell: term, definition, example.";
            return false;
        }

        var term = RestoreFormula(fields[0].Trim());
        if (string.IsNullOrEmpty(term))
        {
            error = $"CSV {rowNumber}. sor: a szó megadása kötelező.";
            return false;
        }

        if (term.Length > MaxTermLength)
        {
            error = $"CSV {rowNumber}. sor: a szó legfeljebb 100 karakter lehet.";
            return false;
        }

        var definition = RestoreFormula(fields[1].Trim());
        if (string.IsNullOrEmpty(definition))
        {
            error = $"CSV {rowNumber}. sor: a definíció megadása kötelező.";
            return false;
        }

        if (definition.Length > MaxTextLength)
        {
            error = $"CSV {rowNumber}. sor: a definíció legfeljebb 500 karakter lehet.";
            return false;
        }

        var example = RestoreFormula(fields[2].Trim());
        if (example.Length > MaxTextLength)
        {
            error = $"CSV {rowNumber}. sor: a példa legfeljebb 500 karakter lehet.";
            return false;
        }

        string? targetMeanings = null;
        if (includeTargetMeanings)
        {
            var meanings = RestoreFormula(fields[3].Trim());
            if (meanings.Length > MaxTargetMeaningsLength)
            {
                error = $"CSV {rowNumber}. sor: a célnyelvi jelentés legfeljebb 200 karakter lehet.";
                return false;
            }

            targetMeanings = meanings.Length == 0 ? null : meanings;
        }

        row = new DeckCsvRow(term, definition, example.Length == 0 ? null : example, targetMeanings);
        error = null;
        return true;
    }

    private static bool TryParseFields(string record, out List<string> fields, out string? error)
    {
        fields = [];
        error = null;
        var current = new StringBuilder();
        var inQuotes = false;
        var closedQuote = false;

        for (var i = 0; i < record.Length; i++)
        {
            var character = record[i];
            if (inQuotes)
            {
                if (character == '"')
                {
                    if (i + 1 < record.Length && record[i + 1] == '"')
                    {
                        current.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                        closedQuote = true;
                    }
                }
                else
                {
                    current.Append(character);
                }

                continue;
            }

            if (character == '"')
            {
                if (current.Length > 0 || closedQuote)
                {
                    error = "A CSV fájl érvénytelen.";
                    fields = [];
                    return false;
                }

                inQuotes = true;
                continue;
            }

            if (character == ',')
            {
                fields.Add(current.ToString());
                current.Clear();
                closedQuote = false;
                continue;
            }

            if (closedQuote)
            {
                error = "A CSV fájl érvénytelen.";
                fields = [];
                return false;
            }

            current.Append(character);
        }

        if (inQuotes)
        {
            error = "A CSV fájl érvénytelen.";
            fields = [];
            return false;
        }

        fields.Add(current.ToString());
        return true;
    }

    [GeneratedRegex(@"[^\p{L}\p{Nd}]+", RegexOptions.CultureInvariant)]
    private static partial Regex NonNameCharacters();
}
