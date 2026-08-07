# Nuggets

A personal knowledge PWA for close reading: capture short notes, mark them up
while reading, and let the resulting graph surface connections you didn't write
down yourself.

Built for one reader's exegetical work — New Testament theology, Greek word
studies, and the secondary literature around them — which is why the marking
system and the AI features are shaped around *arguments and vocabulary* rather
than flashcards.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind · Prisma + SQLite ·
Tiptap · Claude API

---

## What it does

**Capture.** Paste text or Markdown, import an HTML chat export, pull an article
or YouTube transcript from a URL, or convert a raw Bible book into a flowing
text with inline verse markers. A note is assigned to a *domain* (faith,
business, health, books), which tailors the AI prompts.

**Mark up.** Two marking styles over the same text: highlights
(`<mark data-color>`) and thick coloured underlines (`<u data-color>`), six
colours each. The system that gives them meaning:

> **Colour carries the dimension, style carries the level.**
> Highlights mark *statements* (what the text claims), underlines mark
> *language* (how the text works) — so a colour's highlight and underline are
> the same idea one level apart.

| Colour | Dimension | Highlight | Underline |
|---|---|---|---|
| 🟡 | **Kern** | the central claim | the central word |
| 🟠 | **Grund** | what it rests on | the citation formula |
| 🩷 | **Gegen** | what is denied | the negation itself |
| 🟢 | **Folge** | what holds / is promised | the imperative |
| 🔵 | **Aufbau** | the line of thought | the connective |
| 🟣 | **Ich** | my own thought | my open question |

Reusable *templates* (Exegese, Position, Bibeltext) name the twelve slots for a
text genre; a note may then rename any slot for its own purposes.

**Annotate.** Margin comments and reading bookmarks anchor to the text as
W3C-style text quotes (`quote` + surrounding context), never as offsets — they
survive edits and reflow. Any passage can be turned into a short shareable link.

**Connect.** An AI pass extracts *concepts* from each note and records, on the
edge, the specific claim this note makes about that concept. From those edges
alone — never the full texts — further passes derive **Denkanstöße**: tensions
between readings, open questions, latent bridges to neighbouring concepts, and
emergent themes found by community detection over the concept graph.

**Review in aggregate.** *Denkspuren* collects every marking and comment across
a domain, grouped by dimension, colour, or meaning — turning a signal that was
trapped inside single documents into something you can read across the corpus.

## Design principles

- **The graph selects, the model synthesises.** AI passes see distilled edge
  notes and definitions, never nugget bodies. Results are cached on a hash of
  their input, so nothing is regenerated until the input actually changes.
- **Annotations never touch the document.** Marks live in the HTML; bookmarks,
  comments, and insights are metadata beside it. Nothing that resolves a text
  anchor can be invalidated by a feature that only adds metadata.
- **Honest emptiness.** An engine that finds no genuine tension returns none.

## Development

```bash
npm run dev                              # http://localhost:3000
npx prisma migrate dev --name <name>
npx prisma studio
npx prisma db seed                       # domains + built-in mark templates
```

Requires a `.env` with `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and
`ANTHROPIC_API_KEY`.

Architecture notes, invariants, and the reasoning behind past decisions live in
[`CLAUDE.md`](CLAUDE.md); the roadmap is in [`PLAN.md`](PLAN.md).

### Access model

Writing is gated by a single owner password. **Reading is deliberately open** —
the API and pages serve content without authentication. This is a conscious
choice for a single-user instance, not an oversight; anyone self-hosting this
with private material should gate the read paths first.

### Spaced repetition (dormant)

The project began as an SM-2 review app, and the schema still carries `Review`
records plus `/api/due` and `/today`. That flow is **parked**: notes no longer
get a review record, and the home tab shows bookmarks instead. The code is kept
because the idea may return in a different form.

## License

[GNU AGPL-3.0](LICENSE). If you run a modified version as a network service, you
must make your changes available to its users.
