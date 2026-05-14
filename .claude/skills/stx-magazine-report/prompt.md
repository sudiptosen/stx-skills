# Magazine-Quality Report — Reusable Prompt Template

> A content-agnostic template that produces a single self-contained HTML file in the visual register of a printed magazine: cover, chapters, pull quotes, action cards with pill badges, expand-on-tap detail sections, and a closing prediction band.
>
> Use it for any analytical brief where the deliverable benefits from editorial polish: health reports, GTM strategies, onboarding plans, market research, investment memos, product teardowns, portfolio reviews, technical audits, etc.
>
> Paste the prompt below into a new conversation. Attach your source material (PDF, doc, data file). Edit only the **[VARIABLES IN BRACKETS]** before sending.

---

## THE PROMPT (copy from here)

I'm attaching **[SOURCE MATERIAL — e.g. a blood report / market research deck / customer interview notes / financial filings]** for **[SUBJECT — person name / company / project / portfolio]**. Context: **[1–3 sentences of relevant background — who they are, what stage they're at, what they're trying to accomplish, any constraints]**.

I need you to analyze the attached material and produce a **magazine-style deliverable as a single self-contained HTML file**. The goal is to make a non-specialist deeply understand the subject and walk away with a concrete plan of action.

**Topic / domain:** [e.g. cardiometabolic health · go-to-market strategy · Series A fundraising readiness · home renovation plan]

**Style:** [PICK ONE — #1 Navy Blue · #2 Veew Teal · #3 Crimson Magazine · #4 Surprise me — Claude picks a palette that fits the topic]

---

### Before you start

Ask me 1–2 clarifying questions **only if essential** (e.g., if a key input variable wasn't given or a preference is genuinely ambiguous). Don't over-clarify — proceed with reasonable assumptions if context is sufficient. State assumptions inline in the deliverable where useful.

### Analysis approach

1. **Read the entire source** and identify what's strong, weak, missing, or risky.
2. **Cross-correlate findings** — tell the connected story across the data, not isolated facts. Show how one issue cascades into others.
3. **Compare to a relevant benchmark** — peers, prior-year, industry typical, age/stage-appropriate — and call out where the subject sits on the distribution.
4. **Rank the top 3–5 issues or opportunities** in order of urgency or leverage.

### Deliverable structure (HTML magazine, single file)

Use these chapter sections, in this order. Adapt the names to the topic but keep the rhythm:

1. **Cover** — magazine masthead, hero headline, deck (subtitle), subject meta block (name, key attributes, date), 2–4 risk/theme tags, and one dramatic hero stat in a circular "pulse" art element.
2. **The 60-Second Read (TL;DR)** — dark card with subject block + 5–6 score cards highlighting top findings with status flags (CRITICAL / STRONG / WATCH / OK).
3. **Chapter 02 · Analysis** — finding cards in a 2-column grid. Each card has: icon (emoji or SVG), name, status badge, the key number(s) with reference range or benchmark, a colored severity meter with a pin, a "plain English" explainer (italic, with one **metaphor**), the subject-specific implication, and "what this affects" pill tags. Include one reassuring **"What's actually fine"** card at the end.
4. **Chapter 03 · Targets** — table with columns: *Metric · Where You Are · Reasonable Goal · Stretch Goal · Realistic Timeline*. Cover every important out-of-range metric.
5. **Constraints Panel** — dark callout reminding the reader what stays outside this document's scope (legal, medical, financial advice; specific specialist input; regulator sign-off; etc.). This magazine is supporting cast.
6. **Chapter 04 · [Action Domain A]** — e.g. Food, Channels, Hiring, Capital Allocation. Include any quantitative split as an SVG donut or bar (macros, budget %, time allocation), broken into ~5 buckets with concrete numbers, plus three traffic-light zones (🟢 Lean Into / 🟡 Use Sparingly / 🔴 Avoid) populated with **locally / contextually specific** items.
7. **Pull quote** — a magazine-style large italic quote in a band across the page. Short, declarative, quotable.
8. **Chapter 05 · [Action Domain B]** — 6 action cards. Each has: icon, name, dose (frequency / duration / cadence), 2–3 line detail with **specific, locally-grounded references** (real places, real tools, real vendors, real names), and **pill-shaped badges** showing which top-level issues this addresses.
9. **Weekly Schedule (or Quarterly Roadmap)** — grid showing the time horizon × ~4 slots per row with color-coded activity blocks.
10. **Chapter 06 · [Action Domain C]** — 6–8 action cards in the same format with pill badges.
11. **Chapter 07 · [The Detail Library]** — a deep, click-to-expand section. Group into ~4 categories. Each category has a header with a quantitative target badge and 8–10 detail cards.
12. **Chapter 08 · [The Resource List]** — 5–6 shopping/tool/vendor cards with **specific local links**. Each item gets a direct "Open" link with a real working search query for the right local provider.
13. **Outcome quote** — bold prediction band at the end ("If you give this 12 weeks…" / "If you ship this in Q1…").
14. **Footer** — magazine title, edition info, full appropriate disclaimer for the topic.

### The Click-to-Expand Feature (IMPORTANT)

Cards in the **Detail Library** chapter must be **click-to-expand**. Default state shows only icon, name, key metric tag, time/cost tag, and a "Tap to view details" hint with a chevron. On click, the card expands smoothly to reveal:
- **Components as chip-style tags** (parsed from a comma-separated list)
- **Method / steps** in italic prose
- **"Why this works"** — a category-specific tip (different for each of the 4 categories)

The chevron should rotate, the icon should do a tiny tilt, and the card border should shift to a warm accent color when open. Use **a single JavaScript handler at the bottom of `<body>`** that wires up every card by class — do not write per-card handlers.

If the topic has a natural time/cost/effort estimator, include a small JS function that derives the badge value from keywords in the method text (e.g. "marinate" → +20min, "pressure-cook" → 22min, "raw" → 5min; or for GTM: "outbound" → 6 weeks, "PLG motion" → 12 weeks).

### Localization & specificity rules

- **Reference the subject's actual locale.** Real cities, neighborhoods, parks, markets, clubs, schools, tools, vendors. Generic placeholders are forbidden.
- **All external links must be real working search-query URLs** for locally popular providers (e.g. `https://blinkit.com/s/?q=palak` or `https://www.tesco.com/groceries/en-GB/search?query=spinach` or `https://www.amazon.com/s?k=resistance+bands`).
- **Mix 1–2 cross-cultural pivots per category** for variety, but keep the spine local.
- **Numerical targets must add up** to whatever budget / calorie / time / capital constraint the brief specified.

---

### Style spec

Pick one of the four styles below. Render the entire document in that palette and font stack — every chapter, card, badge, severity meter, and footer.

#### **#1 Navy Blue — "The Strategy Brief" (gtm_veew style)**
A serious, editorial, McKinsey-meets-Monocle register. Best for GTM plans, board reports, investment memos, strategic audits.
- **Fonts:** `Fraunces` for headlines + decks, `Inter` for body, `JetBrains Mono` for code/data labels. Load from Google Fonts.
- **Palette:** `--paper: #faf7f2` · `--paper-2: #f2ede4` · `--ink: #0d1421` · `--ink-soft: #2a3447` · `--accent: #1f4e79` (navy) · `--accent-2: #2a72b6` · `--gold: #b8893a` · `--green: #2f6a45` · `--red: #b13d2c` · `--rule: #d9d1c2`
- **Cover treatment:** dark radial gradient `radial-gradient(1200px 700px at 80% -10%, #2a4a7a 0%, #0d1421 55%, #07101e 100%)` with cream text, masthead in `Fraunces` italic, kicker in `JetBrains Mono` uppercase.
- **Accent uses:** chapter rules, severity pins, sparkline strokes, table header underlines.

#### **#2 Veew Teal — "The Founder's Field Guide" (onboarding_veew style)**
The same editorial seriousness as #1 but warmer, more onboarding/handbook in feel. Best for product playbooks, onboarding guides, technical walkthroughs, customer-facing reports.
- **Fonts:** `Fraunces` + `Inter` + `JetBrains Mono` (same stack as #1).
- **Palette:** `--paper: #f7f4ed` (warmer cream) · `--ink: #0d1421` · `--accent: #1f4e79` · `--teal: #1d6b76` (primary accent) · `--gold: #b8893a` · `--green: #2f6a45` · `--red: #b13d2c` · `--rule: #d3c9b6`
- **Cover treatment:** dark blue-charcoal `#0c1521` / `#131922` background with a teal glyph mark; warm cream type.
- **Accent uses:** teal dominates — diagram nodes, callout backgrounds (`linear-gradient(135deg, #ecf3f4, #dcecee)`), section banners. Navy plays a supporting role.

#### **#3 Crimson Magazine — "The Sunday Supplement" (Apurba style)**
Lifestyle magazine, Vogue / Cereal / Kinfolk register. Best for health magazines, wellness plans, travel itineraries, food/recipe-driven reports, anything that wants warmth and craft.
- **Fonts:** `DM Serif Display` for headlines, `Playfair Display` italic for pull quotes / decks, `Bebas Neue` for kickers + labels, `Inter` for body. Load all from Google Fonts.
- **Palette:** `--cream: #fbf6ec` · `--paper: #f6f0e4` · `--ink: #1a1a1a` · `--coral: #e85d4a` (primary accent) · `--coral-deep: #c0392b` · `--red: #a4271e` · `--mustard: #d4a017` · `--teal: #0f5c5e` · `--teal-deep: #063638` · `--sage: #6b8e4e` · `--rose: #f4c5b5` · `--muted: #6b6358`
- **Cover treatment:** cream paper with a coral / mustard / teal three-tone hero block; oversized `DM Serif Display` headline; `Bebas Neue` kicker.
- **Accent uses:** coral for severity pins, teal for callouts (`linear-gradient(135deg, var(--teal-deep), var(--teal))`), mustard for the donut/budget chart, sage for "fine" cards.

#### **#4 Surprise me — Claude picks**
Pick a palette and font stack that fits the topic and subject. State your choice in 2 lines before delivering ("I went with a forest-green + ochre palette in `Fraunces` + `Inter` because the subject is a sustainable-agriculture audit and the register should feel grounded, not corporate."). Then render the whole document in that system. Use the same structural rules as #1–#3 (paper background, ink type, one primary accent, one supporting accent, severity green/amber/red, masthead-style cover).

---

### Layout & responsiveness (all styles)

- **Max-width:** 1100px, generous padding (48–72px vertical between chapters).
- **Two-column grids** collapse to single column under 900px.
- **Print-friendly:** include `@media print` rules so cards don't break across pages, and severity meters print legibly in grayscale.
- **Mobile responsive:** cover, donut, schedule grid, and recipe library all reflow.

### Voice and tone

- Editorial voice, not clinical or corporate. Warm, direct, occasionally cheeky.
- Use **bold** for key takeaways, *italic* for technical or quoted terms.
- Every finding card explainer should include **one plain-English metaphor**. (Examples from past work: HDL = "the garbage truck", hs-CRP = "smoke alarm", churn rate = "the bucket's leak rate", CAC payback = "how many months until the well refills".)
- Be honest about urgency without being alarmist. Phrases like *"the clock has started"*, *"the chassis is sound — it's the engine tuning"*, *"the foundation holds — what's missing is the roof"* work well.
- Pull-quote band lines should feel **quotable**: short, declarative, italic.

### Output handling

- Write the file to my working folder (or a topic-named subfolder if appropriate).
- After saving, give me a `computer://` link to view it.
- Keep the file self-contained — no external JS/CSS dependencies except Google Fonts.
- Brief, scannable summary in chat: **top 3 findings + the link**. No long preamble or postamble.

### Sanity checks before delivering

- Confirm any numerical splits (budget %, calories, time allocation, capital allocation) sum to the target.
- Confirm every Detail Library card has both the components list and the method prose.
- Confirm every action card has at least 2 pill badges.
- Confirm the click-to-expand JS is at the end of `<body>` and the CSS hides the `.detail-*` content by default.
- Confirm every external link is a valid search-query URL for the locally relevant provider.
- Confirm the chosen style's CSS variables are defined once at `:root` and every color in the document references them — no hardcoded hex outside `:root`.

---

## What I (the user) customize each time

| Field | Example |
|---|---|
| Source material | Blood report PDF · GTM deck · 10-K filing · customer interview transcripts |
| Subject name | Apurba Dev · Acme Robotics · Q3 portfolio · The Henderson kitchen reno |
| Subject context | 59 / Male / Kolkata / sedentary · Pre-seed B2B SaaS / 2 founders / $400k raised · etc. |
| Topic / domain | Cardiometabolic health · GTM for a vertical SaaS · 12-month founder onboarding |
| Locale / region | Kolkata, India · London, UK · NYC, US · Berlin, DE |
| Constraints | 1200 kcal/day · $250k budget · 3-person team · ship by Q1 |
| Style | #1 Navy Blue · #2 Veew Teal · #3 Crimson Magazine · #4 Surprise me |

## Optional add-ons I can request later

- A printable A4 PDF version
- A printable one-page checklist or "fridge magnet" summary
- A tracking sheet (xlsx) with the right metric columns for the topic
- Specific deep-dive research on one finding (drug interactions, competitor teardown, tax treatment, etc.)
- Translation to a regional language
- A companion view for a second audience (the spouse cooking the meals · the co-founder running ops · the parents of the student)

---

*Template generalized from the Apurba Dev health magazine + Veew GTM/onboarding briefs · May 2026*
