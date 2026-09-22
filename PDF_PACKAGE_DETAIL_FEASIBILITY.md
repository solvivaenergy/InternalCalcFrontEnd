# Page 3 "System package in detail" → Figma parity + Story 004 header dates

**Feasibility audit, 2026-09-15.** Target: the Figma `RSD excluded` frame in
[PDF Proposal](https://www.figma.com/design/nv7v6YAZGnIzEmTpwFTBhq/PDF-Proposal).
Covers stories **004** (Date Issued / Valid Until on every page header) and **026**
(itemise each component, no per-item prices).

> Method note: the Figma MCP connector could not be authorised in the session that produced
> this audit, so the design spec was transcribed from a screenshot. **Every colour, font size,
> and the 68/32 column split is unconfirmed** and must be re-read from Figma before final
> styling. Structure, copy, and row order are confirmed. Everything else below was verified
> against the actual code, and the layout arithmetic was measured by running the installed
> jspdf 2.5.2 / jspdf-autotable 3.8.4 with the embedded Inter metrics.

---

## Verdict

**No hard code blockers.** Every sub-line in all three groups already exists as a
`description` string on `model.pkg.items`, and the engine already stamps `i.category` as
`'solar' | 'battery' | 'misc'` — the three Figma groups. The description-substring classifier
at [pdfGenerator.js:1716-1747](src/lib/pdfGenerator.js#L1716-L1747) can be deleted outright.
`calculations.js` needs no change.

The real constraints are page height, four decisions the mock cannot answer, one genuinely
underivable data point (the breaker AT range), and — if the date is stamped at generation
time — a change in `App.jsx`, so this is **not** purely a `pdfGenerator.js` job.

---

## Blockers

### True blockers — four, all narrow

1. **The AC breaker's "30AT to 125AT" range is underivable.**
   [adminParams.js:542-606](src/data/adminParams.js#L542-L606) ships nine discrete
   single-rating SKUs with the pole count baked into each label, and there is **no ampacity or
   sizing logic anywhere** in `src/` (`ampacity|breakerAt|poleCount|sizeBreaker` → no hits).
   30AT and 125AT are simply the catalog extremes.
   *Unblocked by:* choosing between the picked SKU via the existing
   `${row.count} Unit/s ${item.label}` ([calculations.js:1934](src/lib/calculations.js#L1934))
   or a static generic inclusion line with no amount.

2. **Exact hexes, the ~68/32 split, and spacing are unconfirmed** — Figma MCP was not
   authorisable non-interactively.
   *Unblocked by:* authorising the connector or handing over the fills. Until then, implement
   the transcribed values as named constants beside the palette at
   [pdfGenerator.js:47-59](src/lib/pdfGenerator.js#L47-L59) so a confirmed palette is a
   one-place swap.

3. **A true 6-character "Reference No." needs a server-side counter.** `makeQuoteRef`
   ([pdfGenerator.js:98-108](src/lib/pdfGenerator.js#L98-L108)) emits `SV-YYYY-NNNN` from a
   name + day-of-year hash — 12 chars, **and not unique**. A real sequence needs a DB
   migration, and the Supabase connector available here is production and read-only (no DDL).
   *Unblocked by:* confirming `XXXXXX` is Figma placeholder text for the existing format
   (decision 4). If the format does change, `makeLeadRef` must move with it —
   [lead.js:31-40](src/lib/lead.js#L31-L40), [App.jsx:1689](src/components/App.jsx#L1689),
   [MobileFlow.jsx:1454-1455](src/components/MobileFlow.jsx#L1454-L1455).

4. **Story 026 acceptance #4 — "validated against the Engineering bill of materials" — has no
   in-repo referent.** Nothing in `src/data/` is a BOM (`devices.js` is 37 lines of appliance
   duty factors; `inventory.js` is panels + inverters only).
   *Unblocked by:* Engineering signing off on the labels at
   [calculations.js:1736-1770](src/lib/calculations.js#L1736-L1770) and
   [:1444-1665](src/lib/calculations.js#L1444-L1665). **Blocks no code.**

### Not blockers — just work

The grouping rewrite, the group-spanning Amount cell (`rowSpan` verified running, and groups
never split across pages — the library refuses,
[jspdf.plugin.autotable.js:1853-1864](node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.js#L1853-L1864)),
the three header lines, the roof line, the DST row, the discount row, the header/Total restyle,
the prose bottom block, and the watermark.

**The watermark needs no new asset.** The faint sun-ray is already inside
`public/proposal-background.jpg` (measured bbox x 102.3-209.3mm, y 189.6-296.7mm) and is
stamped on every page at [pdfGenerator.js:268](src/lib/pdfGenerator.js#L268). It is *occluded*
today by opaque striped rows and the amber box.

---

## Decisions needed from you

| # | Question | Why it can't be inferred | Recommendation |
|---|---|---|---|
| 1 | Do **group amounts** print, or only the Total? | The mock's Amount column is blank — an unfilled template. Story 026 #3 says "only the total package price appears". | Total only, per the story |
| 2 | **AC breaker** label | True blocker 1 | Print the picked SKU |
| 3 | **Documentary Stamp Tax** row | `dst` is a tax on the *loan*, is **not** inside `netDirectPrice` ([:2085](src/lib/calculations.js#L2085)), is already billed once as its own schedule milestone ([schedule.js:592-598](src/lib/schedule.js#L592-L598)), and is shown per-tenor on page 4. `dst = 0` whenever `tenor < 1`, and the app default is `tenor: 0` — so on a typical cash proposal this row prints ₱0. | Print **below** the Total as an informational financing note; Total stays `netDirectPrice` |
| 4 | **Reference No. format** | True blocker 3 | Keep `SV-YYYY-NNNN`; fix the lead-ref mismatch separately |
| 5 | **12 write-in lines** — always 12, or 12 minus filled? | 12 is the product's misc-row cap, not a frame artifact. But `MISC_MAX_ROWS` is **not exported** ([Step2Packages.jsx:1953](src/components/Step2Packages.jsx#L1953)) and the engine applies no cap ([calculations.js:1907](src/lib/calculations.js#L1907)). | 12 minus filled, via `Math.max(12, miscItems.length)` so a restored session with >12 rows can't silently drop a priced line |
| 6 | Drop **"(VAT Inclusive)"** from the Total label? | [:1815](src/lib/pdfGenerator.js#L1815) is the **only** VAT mention in the whole PDF, and no T&C clause covers inclusivity. | **Keep it.** Zero-risk action is no change |
| 7 | **ATS / Materials for Critical Loads** always shown? | Mock shows both; each is zeroed when the rep unchecks it, then filtered out. | Label-only when dropped, like declined RSD |
| 8 | **Battery group title** with or without kWh? | Mock says "Battery Package"; today `${kWh} kWh Battery Package`. The mock's Solar title *keeps* its size, so the omission may be a transcription artifact. | Keep the kWh for symmetry |
| 9 | **Roof / location group** | Engine says `roof: "misc"` ([:1344](src/lib/calculations.js#L1344)); mock puts Roof Type in group 1. Changing the map also moves it in the Summary tab, and there is **no test gate** on it. | Special-case `key === 'roof'` into group 1 in `pdfGenerator.js` only |
| 10 | **Stamp the issue date at generation time?** | See story 004 findings — today it's the tab-session start. | Yes; note this puts `App.jsx` in scope |
| 11 | **Warranty casing** | Data says "5 years"/"1 year"; mock shows "(5 Years)"/"(1 Year)". Step 6 reads the data verbatim. | Title-case in the mock wins |
| 12 | **Discount sign and zero format** | Today `peso(-discountVal)` renders `₱-5,000` ([:1808](src/lib/pdfGenerator.js#L1808)); the UI uses U+2212 *before* the ₱ ([Summary.jsx:396](src/components/Summary.jsx#L396)); `NEG` at [:61](src/lib/pdfGenerator.js#L61) is an ASCII hyphen, not U+2212. Also ₱0 vs em-dash once the row is unconditional. | Match the UI: U+2212 before ₱, em-dash at zero |

---

## Per-element feasibility

### Group 1 — Solar

| Element | Source | Status |
|---|---|---|
| `5 kWp Solar Package` title | computed `kwpStr`, [:1754](src/lib/pdfGenerator.js#L1754) | ready — keep the kWp prefix; `PACKAGE_CATEGORIES.label` has no size |
| `8 units 630W Solar Panels` | [calculations.js:1445](src/lib/calculations.js#L1445) | ready — verbatim template |
| `Mounting Support` | [:1479](src/lib/calculations.js#L1479) | ready — verbatim |
| `Cables, Conduits, Fittings…` | [:1545](src/lib/calculations.js#L1545) | ready — expansion mode swaps a longer suffix at [:1544](src/lib/calculations.js#L1544) |
| `Solar Labor & Installation` | [:1596](src/lib/calculations.js#L1596) | ready — fixed overhead rolls in here |
| `5.00 kW Inverter` | [:1665](src/lib/calculations.js#L1665) | ready — **0 to 3 rows**, not exactly one ([:1658](src/lib/calculations.js#L1658)) |
| `1 Unit/s AC Breaker, …` | [adminParams.js:542-606](src/data/adminParams.js#L542-L606) | **decision 2** — SKUs also seeded `category:"misc"` |
| `AC/DC Excess` | [:1562](src/lib/calculations.js#L1562) + [:1577](src/lib/calculations.js#L1577) | needs a 2-key sum; ₱0 at default cable lengths |
| `Roof Type` | [:1798/1802/1805](src/lib/calculations.js#L1798), key `roof` | **broken today** — risk 3 |
| `Rapid Shutdown Device*` | [:1766](src/lib/pdfGenerator.js#L1766) | **needs rework, not ready** — risk 4 |
| **Sub-line indent + blue-gray text** | per-row `styles.cellPadding.left` + `textColor` (precedent [:1767](src/lib/pdfGenerator.js#L1767)) | ready — but has a hard wrap budget, risk 2 |

### Group 2 — Battery

All five sub-lines exist **verbatim**, in the exact order the mock draws them, with
`category === 'battery'` already stamped. Zero new data, zero engine change.

| Element | Source |
|---|---|
| `2 unit/s 5kWh Battery w/ Cables & Lugs` | [:1736-1741](src/lib/calculations.js#L1736-L1741); unit count = `Math.ceil(batteryKwh / pkg.batteryUnitKwh)` ([:1698](src/lib/calculations.js#L1698)), also derivable in-PDF — [pdfGenerator.js:697-700](src/lib/pdfGenerator.js#L697-L700) already does it |
| `1 unit/s Battery Rack` | [:1742-1747](src/lib/calculations.js#L1742-L1747), distinctly priced at [:1719](src/lib/calculations.js#L1719) |
| `Automatic Transfer Switch (ATS)` | [:1748-1753](src/lib/calculations.js#L1748-L1753) |
| `Materials for Critical Loads` | [:1754-1759](src/lib/calculations.js#L1754-L1759) |
| `Battery Labor & Installation w/ Solar Package Installation` | [:1725](src/lib/calculations.js#L1725), `hasSolar` branch |

### Group 3 + summary rows

| Element | Source | Status |
|---|---|---|
| Group 3 title | [adminParams.js:1578](src/data/adminParams.js#L1578) | ready — code label lacks the mock's Oxford comma; **override the string in `pdfGenerator.js`**, don't edit the shared label (it also feeds [Summary.jsx:229](src/components/Summary.jsx#L229) and [AdminShared.jsx:1360](src/components/AdminShared.jsx#L1360)) |
| Filled 2F rows | [:1934](src/lib/calculations.js#L1934) / [:1947](src/lib/calculations.js#L1947) | ready — `${count} Unit/s ${label}` already matches |
| `Line 1` … `Line 12` | static copy | **decision 5** |
| `Less: Discounts` | `terms.discountAmount`, [:2084](src/lib/calculations.js#L2084) | ready — note [:1805](src/lib/pdfGenerator.js#L1805) reads a **nonexistent** `terms.promoDiscountAmount` |
| `Documentary Stamp Tax` | `terms.dst` | **decision 3** |
| `Total` | `terms.netDirectPrice` | ready — **decision 6** on the label |

### Header (story 004)

| Element | Source | Status |
|---|---|---|
| `Valid Until` | `ctx.validUntil`, rendered in all 3 headers | ready — re-label, move down a slot |
| `Reference No.` | `ctx.quoteRef`, printed at [:333](src/lib/pdfGenerator.js#L333)/[:555](src/lib/pdfGenerator.js#L555)/[:2690](src/lib/pdfGenerator.js#L2690) | ready — **decision 4** |
| `Date Issued` | `ctx.generatedDate` at [:3213](src/lib/pdfGenerator.js#L3213) — exists, **printed nowhere** | new line, value in hand |
| Date format | `fmtDate` ([:89](src/lib/pdfGenerator.js#L89)) emits `September 15, 2026`, `en-US` explicit | ready — day not zero-padded |
| Non-editable (AC4) | Setter-less `useState` ([App.jsx:666](src/components/App.jsx#L666)) | confirmed |
| Vertical cost of line 3 | — | **zero.** Ink bottom 26.79mm vs page-3 title ink top 29.06mm, and the block is right-aligned at x=195 while titles end near x=80-106mm. The new labels are also *shorter* than today's "Quotation valid until …" |
| On *every* page (AC3) | 3 separate header implementations; `newPage` draws no header | step 4 |

### Bottom block

All 12 strings exist hardcoded and match the transcription
([:1877-1893](src/lib/pdfGenerator.js#L1877-L1893)); the prose form is `inclusions.join(", ")`
and `warranties.map(w => \`${w.label} (${w.duration})\`).join(", ")`. Reuse the `renderCol`
two-column pattern at [:2944-2993](src/lib/pdfGenerator.js#L2944-L2993) — **not**
`drawParagraph`, which hardcodes width/x and calls `pageBreakIfNeeded` mid-block, orphaning the
right column. Heading is "Warranty coverage" at [:1875](src/lib/pdfGenerator.js#L1875) vs the
mock's "Warranty". Two conflicting brand greens exist: `C.brandGreen [31,82,43]`
([:48](src/lib/pdfGenerator.js#L48)) vs `#25543A` ([ui.jsx:18](src/components/ui.jsx#L18)).

---

## Implementation plan

**Table approach: option A — `rowSpan` on the Amount cell, one autotable row per visual line.**
Verified against the installed version, not just the type definitions: `rowSpan` +
`valign: 'middle'` centres the group amount; `cellPadding.left` gives the indent;
object-valued `lineWidth: {right: 0.15}` produces a continuous vertical divider (measured 29
abutting segments at x=137.4 ending exactly where `Less: Discounts` begins); groups move
atomically across page breaks.

Option B (multi-line cell) is impossible — `printRow` applies styles **once** per cell.
Option C (hand-drawing) is unnecessary.

| # | Step | Files | Size |
|---|---|---|---|
| 1 | **Add `pageBreakIfNeeded` before the bottom block.** This is the load-bearing fix — see risk 1. The `addPage`/`willDrawPage` patch is *defensive* (the table is within one row of breaking), still worth adding | `pdfGenerator.js:1871`, `:1840` | S |
| 2 | Replace the substring classifier with `i.category`; build group arrays instead of two scalar accumulators. Derive each group's presence gate from the row predicate so the `> 0` / `!== 0` asymmetry can't hide a negative-net group | `pdfGenerator.js:1711-1747`, `:1753`, `:1778` | M |
| 3 | Rebuild the body as group title + sub-line rows + `rowSpan` amount. RSD becomes a **one-cell** row inside group 1's span. Restyle head; `theme: 'plain'`; `styles.font: "Inter"`; per-row indent + blue-gray `textColor` | `pdfGenerator.js:1780-1866` | L |
| 4 | Header third line. `drawTopHeaderFigma` covers 5 of 7 pages from one edit; cover and schedule need separate edits (two coordinate systems — raw mm vs Figma-px via `fxmm`). Add an `opts.header` callback to `newPage` for AC3 | `:313-347`, `:555-556`, `:2690-2694`, `:237` | M |
| 5 | Roof Type always-visible fix + AC/DC Excess 2-key sum | `pdfGenerator.js` | S |
| 6 | Bottom block → two prose columns via `renderCol`. **The warranty column drives the height at 68/32**, not Inclusions | `pdfGenerator.js:1868-1924` | M |
| 7 | Re-point the group-3 footnote resolver — it keys off the `"Other costs:**"` row at [:1787](src/lib/pdfGenerator.js#L1787) that step 3 deletes, orphaning `"**Other Costs"` at [:1954](src/lib/pdfGenerator.js#L1954) | `pdfGenerator.js:1954` | S |
| 8 | If decision 10 lands: stamp the date at generation time | `App.jsx:666-679`, `:931-936`, `:811-816` | S |
| 9 | Re-read exact colours / sizes / column split from Figma and correct | `pdfGenerator.js` | S |

Steps 1 and 2 are worth doing even if the Figma port is deferred — they fix live defects.

---

## Risks

### 1. Page overflow — and it fails silently

**The table does not paginate today.** At the current config
([:1841-1864](src/lib/pdfGenerator.js#L1841-L1864), 8pt / cellPadding 2) the 32-row table ends
at **finalY 276.71 on one page** (last body row at y=269.06; autotable's own limit is
297 − 40/2.8346 = 282.89). It is within **7.25mm — one row** — of breaking.

The live failure is different: `mgr.y = finalY + 6 = 282.7` at
[:1866](src/lib/pdfGenerator.js#L1866), so the bottom block's headings draw at 286.7 — below
the footer baseline `PAGE_H − 12 = 285` ([:288](src/lib/pdfGenerator.js#L288)) — and its seven
7.5mm rows step off the page. The block at
[:1868-1924](src/lib/pdfGenerator.js#L1868-L1924) has **no `pageBreakIfNeeded`**; the only one
in the whole 357-line function is at [:1997](src/lib/pdfGenerator.js#L1997) for the amber box.
So it does not reflow to page 4 — **it draws past the page edge and vanishes.**

**There are two different limits, not one.** The amber box is guarded and relocates itself; the
unguarded bottom block must end above ~285. Treating it as a single "275 cap" sends you
chasing the wrong overflow.

**Type-scale options, measured with the frame's *mixed* scale** (8pt bold group titles, 8pt
Less/DST, 9pt Total — uniform-type figures are 10-13mm optimistic):

| Scale | Table h | finalY | Total budget |
|---|---|---|---|
| 7pt / 1.2 | 182.8mm | 219.8mm | **over by 14-24mm** |
| 6.5pt / 0.9 | 160.1mm | 197.1mm | 0-8mm slack |
| **sub 7/0.7, titles 8/1.6** | **159.2mm** | **196.2mm** | cheapest option |

Only the mixed scale *with a compact prose block* keeps everything on page 3. The prose block
is 20.6mm only if re-laid-out tightly; reusing today's +14 heading offset
([:1895](src/lib/pdfGenerator.js#L1895)) gives 30.6mm. Budget 21-31mm.

### 2. Sub-line wrap budget

The widest emitted sub-line — expansion-mode cabling,
[calculations.js:1544](src/lib/calculations.js#L1544) — measures **128.1mm @8pt / 112.1mm @7pt
/ 104.1mm @6.5pt** against 114.4mm usable at 68/32 with a 6mm indent. So it **wraps at 8pt
even in today's 135mm column** (127mm usable), and at 7pt the indent plus right padding cannot
exceed ~10mm. At 7pt and 6.5pt, measured with the real long strings, there are **zero** extra
wraps.

### 3. autotable silently ignores "semibold"

The `helvetica`→Inter remap at [:151-183](src/lib/pdfGenerator.js#L151-L183) patches
`doc.setFont` **only** — never jsPDF's internal fontmap. So `getFontList()["helvetica"]` is
still `[normal, bold, italic, bolditalic]`, and autotable *validates* `styles.fontStyle`
against that list and substitutes `availableFontStyles[0]` with no warning. Any cell asking
for `semibold` or `medium` with `font: "helvetica"` draws **Inter-Regular**.

Direct `doc.text` calls are unaffected — `setFont("helvetica", "semibold")` works there.
Fix: `styles.font: "Inter"` on the rebuilt table, or alias
`doc.addFont("Inter-SemiBold.ttf", "helvetica", "semibold")`.

**This fix also lands on page 6.** [:2798](src/lib/pdfGenerator.js#L2798) passes
`styles.font:"helvetica"` and [:2811](src/lib/pdfGenerator.js#L2811) asks for
`fontStyle:"medium"`, which currently renders regular — so fixing the bug **changes the
schedule header's appearance**. Intended, but don't be surprised by it.

### 4. RSD needs rework, and prints a price when availed

The frame puts RSD as the **9th sub-line inside group 1**, so it must push **one** cell and be
counted in the rowSpan. The current two-cell push at
[:1764-1773](src/lib/pdfGenerator.js#L1764-L1773) (blank amount at
[:1769](src/lib/pdfGenerator.js#L1769)) cannot survive as-is.

Separately, the *availed* branch at [:1775](src/lib/pdfGenerator.js#L1775) does
`body.push([\`${rsdRaw.description}*\`, peso(rsdAmount)])` — a **second Story 026 #3
violation**, and a second amount cell inside group 1's span. Decision 1 covers only group
roll-ups, so call this out explicitly.

Label also mismatches: rendered text is
`"Rapid Shutdown Device (RSD) for 8 Solar Panels* (excluded…)"`
([calculations.js:1635](src/lib/calculations.js#L1635) +
[pdfGenerator.js:1766](src/lib/pdfGenerator.js#L1766)) vs the frame's
`"Rapid Shutdown Device*"`.

### 5. Roof Type is invisible on most quotes today — story 026 #1 fails

Default `roofMaterial` is `'metal'` ([App.jsx:142](src/components/App.jsx#L142)), metal is
**₱0**, and the renderer filters `i.directPrice !== 0`
([:1711-1714](src/lib/pdfGenerator.js#L1711-L1714)) — so most live quotes show no roof line.
Roof *cost* already reaches the total correctly
([calculations.js:1801](src/lib/calculations.js#L1801) → `netDirectPrice`), so story 026 #5 is
fine; only the *label* is missing. Fix is renderer-only: pull the roof item off the
**unfiltered** array (the [:1690](src/lib/pdfGenerator.js#L1690) pattern) and emit it
label-only. `"Roof Type"` as a literal exists nowhere in `src/`; the human-readable roof labels
are non-exported inline literals.

### 6. The Amount column doesn't foot to its own Total today

`d.includes("rsd")` at [:1718](src/lib/pdfGenerator.js#L1718) swallows the `rsdLabor` line and
nothing re-prints it — a **₱16,516 hole**, proven at runtime. Step 2 fixes it as a side effect.
Worth knowing the column already doesn't reconcile, so "adding DST breaks the arithmetic" isn't
the objection it appears to be.

### 7. Zebra striping is already hiding the watermark

The autoTable call passes no `theme`, so `striped` applies `table.fillColor 255` — **opaque** —
to every body cell via the style merge. Not prospective; happening now. `theme: 'plain'` fixes
it and is needed anyway.

---

## Cross-page side effects

- **Page 6 will disagree with page 3 after the header restyle.** The schedule table keeps
  `fillColor [31,82,43]` / `textColor [210,255,30]`
  ([:2808-2812](src/lib/pdfGenerator.js#L2808-L2812)) while page 3 goes light on dark. Accept
  or restyle both.
- **Tightest header clearance is page 5, not page 3.** `drawVisualizingPage`
  ([:2243-2249](src/lib/pdfGenerator.js#L2243-L2249)) has no `mgr.y += 2` and a 14pt title at
  `mgr.y + 5` → ink top 28.41mm vs the third line's ink bottom 26.79mm = **1.62mm**. It clears
  horizontally, but page 5 has no `pageBreakIfNeeded` at all.
- **Do not relabel the two prose "valid until" sentences** at
  [:3014](src/lib/pdfGenerator.js#L3014) (live T&C) and
  [:3107](src/lib/pdfGenerator.js#L3107) (dead `drawAcceptancePage`) when step 4 edits the
  header strings.
- The T&C page draws its header at 195mm ([:334](src/lib/pdfGenerator.js#L334)) but its footer
  at 202.5mm via `figmaExact` ([:302](src/lib/pdfGenerator.js#L302)).
- **The T&C page is silently missing its warranty table.** The `{kind:"warrantyTable"}` handler
  renders nothing ([:2922-2924](src/lib/pdfGenerator.js#L2922-L2924) sets
  `currentBlock = null`) and `drawWarrantyTable` ([:3030](src/lib/pdfGenerator.js#L3030)) is
  dead — one array with a no-op consumer. Fix or delete it in the same pass, since step 6
  touches the same warranty facts.

---

## Story 004 findings beyond the header line

Worth separate tickets:

- **`generatedDate` is the tab-session start, not the PDF-generation moment.** Seeded from
  `sessionStorage`, so it's only *visibly* wrong once the tab survives midnight or is reused on
  a later day — but that contradicts AC1/AC4 as written.
- **Lock-and-reset preserves the previous customer's issue date.** `handleLockConfirm`
  ([App.jsx:811-816](src/components/App.jsx#L811-L816)) wipes steps 1-4, mode, and admin access
  but never clears `GENERATED_DATE_KEY`, so the next customer in the same tab inherits the
  prior quote's issue date *and validity window*.
- **`validUntil` is not frozen per quote.** Recomputed from live `ADMIN_PARAMS.quoteValidityDays`
  on every `paramsRev` bump ([App.jsx:680-690](src/components/App.jsx#L680-L690)), so a Product
  admin editing `quoteValidity` ([ProductTab.jsx:61-71](src/components/ProductTab.jsx#L61-L71))
  shifts the printed "Valid Until" on every open quote. Direct tension with AC4.
- **Timezone.** `new Date()` is the host clock and `toLocaleDateString` renders in the host
  zone, so a rep outside PH near midnight can print a date one day off Asia/Manila. Locale is
  safe; only the zone is implicit.
- Day is not zero-padded: `September 5, 2026`, not `September 05, 2026`.

## Incidental dead code

- `drawSnapshotPage` is dead and `ctx.snapshots` is never read — yet the file header comment
  still describes pages 3 and 4 as PNG snapshots and lists a page order the code doesn't build.
- `/logo-sun-v2.png` is fetched on every generation and never drawn.
- `drawWarrantyTable` is a second hardcoded copy of the warranty facts with a different key
  shape, and its renderer is dead. A third copy lives at
  [adminParams.js:1558-1564](src/data/adminParams.js#L1558-L1564).
- `rsdRaw.declined` and `rsdRaw.notionalPrice` are dead reads — nothing in the tree sets them.
