# Plan 5: UI Design System — Visual Redesign + History Page

Renumbering note: this becomes **Plan 5**. The Oracle VM deployment work
previously called "Plan 5" is now **Plan 6** — it still hasn't started and
is still fully deferred.

Design reference approved by the user: a SaaS analytics dashboard landing
page (indigo→violet gradient hero, card-based dashboard, green CTA),
adapted per the decisions below. The approved visual proposal (colors,
type, component mockups) lives in the published artifact
"JustSayIt Design System" — treat its exact hex values, font choices, and
component treatments as binding unless a rule below overrides them.

## Global Constraints

These apply to every task. An implementer who violates one of these has
produced a defect, not a stylistic difference.

1. **Brand color never overlaps transaction semantics.** Brand accent is
   indigo/violet (`#4F46E5` → `#8B5CF6` gradient, solid `#4F46E5` outside
   hero moments). `income` (`#0E9F6E` light / `#35D399` dark) and `expense`
   (`#E0463B` light / `#FB7B71` dark) are reserved exclusively for
   transaction amount coloring — never reused as a button/brand color
   anywhere in the app.
2. **Currency grouping rule from Plan 4 still applies.** Any new
   aggregation (day subtotals in History, month totals in Stats) groups by
   currency and never sums across currencies. A day/month with mixed
   currencies shows one subtotal line per currency, not a combined number.
3. **Dark mode follows system only — no manual toggle.** Implement via
   `@media (prefers-color-scheme: dark)` CSS tokens exactly per the
   `artifact-design` skill's three-state token pattern (bare `:root` =
   light values; media-query block redefines for dark). Settings page gets
   no theme switcher — this was an explicit user decision, not an
   oversight to fix later.
4. **Radix is scoped to Toast only.** The user approved Radix "only where
   an interaction is genuinely tricky." After reviewing this plan's actual
   components, only the toast/snackbar system (success+undo, sync warning,
   generic errors) qualifies — it needs focus management, auto-dismiss
   timing, and swipe-to-dismiss that are easy to get subtly wrong by hand.
   Do not add `@radix-ui/react-dialog` or any other Radix package unless a
   task below explicitly calls for it. The search filter panel, category
   `<select>`, and everything else stay hand-built Tailwind, matching the
   rest of the codebase.
5. **No charts.** Per explicit user instruction, this plan ships zero data
   visualizations (no donut, no line/bar charts, no sparkline). Stats and
   History display numbers and plain category/day rows only. The published
   design artifact's donut and line-chart mockups are NOT part of this
   plan's scope — do not implement them.
6. **Month navigation is shared, not duplicated.** Both History and Stats
   need "previous/next month" browsing. Build one `MonthSwitcher`
   component and one navigation hook; do not write two separate
   implementations. `periodRange()` in `src/lib/ledger/stats.ts` already
   accepts an arbitrary `referenceDate` — the gap is UI-level (both pages
   currently hardcode `new Date()`), not logic-level.
7. **Everything stays local-first, in-memory.** No backend pagination, no
   IndexedDB range queries. `ledger.transactions` is already fully
   replayed into memory (Plan 1-4 architecture) — History's month-scoping
   and search are pure client-side `Array.filter()` over that array, same
   pattern as `computeStats`.
8. **i18n dictionary keys are additive.** Add new `DictKey` entries for
   new copy; do not repurpose an existing key's meaning for unrelated
   text. Every new string needs both `en` and `zh` values (TypeScript's
   `Record<DictKey, ...>` exhaustiveness check enforces this — do not
   silence it).
9. **Icons are lucide-react, not emoji, everywhere going forward.** Any
   component this plan touches that currently renders an emoji (🎤, etc.)
   gets a lucide icon instead. Components this plan does NOT touch keep
   their existing emoji until a later pass — do not scope-creep into
   files with no task below naming them.
10. **Responsive is real, not stretched.** Per the user's explicit
    decision, desktop gets a genuinely different layout for History and
    Stats (sidebar nav, side-by-side panels) — not the mobile layout with
    more whitespace. The Login/marketing page also needs to look
    intentional on desktop, since that's the page a new user is most
    likely to open first on a laptop.

## Pre-flight scan

| Pair / Task | Produces vs Consumes | Finding |
|---|---|---|
| Task 1 (tokens) → all visual tasks | CSS custom properties + Tailwind `@theme` mapping | Every later task styles against these tokens; must land first. |
| Task 2 (icons) → Task 4, 9, 12 | `CATEGORY_ICONS` map, lucide replacing emoji dict entries | Composer/TransactionRow/marketing tasks consume this. |
| Task 3 (Toast) → Task 4, 5 | `useToast()` hook + `<Toaster/>` | UndoToast and SyncWarning rebuilds both consume it — sequence 3 before 4/5. |
| Task 6 (history data) → Task 7 | `groupByDay`, `filterHistory` | History page task consumes both; must land first. |
| Task 8 (MonthSwitcher) → Task 7, 11 | Shared component + hook | Both History and Stats consume it; build once, before either page task. |
| Task 7 → Task 9 | History page exists | Record page's "View history →" link (Task 9) needs Task 7's route to exist. |
| Task 10 (BottomNav 3-tab) → Task 7, 9, 11 | Nav must know about `/history` | Sequence after Task 7 so the route it links to already exists. |
| Global Constraint 5 vs. design artifact | No-charts rule vs. artifact's donut/line-chart mockups | **Ruling recorded here in advance:** artifact is binding for color/type/component *treatment*, NOT for the specific chart mockups — Constraint 5 overrides those two elements of the artifact. Noted so no implementer "corrects" Stats/History to match the artifact's charts. |

**Verdict:** scan clean given the ruling above. Proceeding task order:
1 → 2 → 3 → 4 → 5 → 6 → 8 → 7 → 10 → 9 → 11 → 12 → 13 → 14 → 15.

---

## Task 1: Design tokens + Tailwind v4 theme + fonts

**Files:** `src/app/globals.css`, `src/app/layout.tsx`

**Why this order:** every other task styles against these tokens. Landing
this first means later tasks never invent their own one-off colors.

**Steps:**
1. In `globals.css`, define CSS custom properties for the full palette
   from the approved design artifact, structured per `artifact-design`'s
   three-state pattern:
   - Bare `:root` block: light values — `--bg`, `--surface`, `--surface-2`,
     `--ink`, `--muted`, `--border`, `--brand`, `--brand-2`, `--brand-soft`,
     `--brand-ink`, `--income`, `--income-soft`, `--expense`,
     `--expense-soft`, `--warning`, `--warning-soft`, plus
     `--radius-sm/md/lg` and the two shadow tokens from the artifact.
   - `@media (prefers-color-scheme: dark)` block, guarded as
     `:root:not([data-theme="light"])` even though this app has no manual
     toggle (Constraint 3) — the guard costs nothing and keeps the pattern
     consistent with the artifact-design contract in case a toggle is ever
     added later. Redefine every token above with the dark values from the
     artifact.
   - Do NOT add a `:root[data-theme="dark"]` block — there is no toggle to
     drive it (Constraint 3). This is a deliberate deviation from the full
     three-state pattern, justified by Constraint 3.
2. Map tokens into Tailwind v4's CSS-based theme via `@theme` in
   `globals.css` (e.g. `--color-brand: var(--brand);` etc.) so utilities
   like `bg-brand`, `text-income`, `border-border` work everywhere.
3. Load fonts via `next/font/google` in `layout.tsx` (not a raw
   `<link>` — this is a real Next.js app): Outfit (weights 500/600/700/800)
   for display, IBM Plex Sans (400/500/600) for body, IBM Plex Mono
   (400/500/600) for numerals. Expose them as CSS variables
   (`--font-display`, `--font-body`, `--font-mono`) via each font loader's
   `variable` option, apply `--font-body` as the default on `<body>`, and
   apply `--font-display`/`--font-mono` via Tailwind utility classes
   (`font-display`, `font-mono`) wherever the artifact calls for them.
4. Give every element that currently renders a monetary amount
   (`TransactionRow`, `EditForm`, Stats, History) `font-variant-numeric:
   tabular-nums` via the mono utility — do this as part of Task 14's
   polish pass, not here; this task only needs to make the utility class
   available.
5. Remove the placeholder `body { max-width: 720px; ... }` rule — Task 15
   (responsive/desktop) replaces it with real breakpoint-aware layout.

**Test:** a throwaway component rendering `bg-brand text-income
font-display` resolves to the correct computed colors/fonts in both a
light-preference and dark-preference jsdom/browser environment (or a
manual browser check if jsdom can't emulate `prefers-color-scheme` —
confirm which before writing the test).

---

## Task 2: Icon system (lucide-react)

**Files:** `package.json`, new `src/lib/i18n/categoryIcons.ts`, edits to
`src/components/Composer.tsx`

**Steps:**
1. `npm install lucide-react`.
2. Create `CATEGORY_ICONS: Record<CategoryKey, LucideIcon>` in
   `categoryIcons.ts`, mirroring `CATEGORY_LABELS`'s structure — pick one
   sensible lucide icon per category (e.g. `UtensilsCrossed` for FOOD,
   `Car` for TRANSPORT, `ShoppingBag` for SHOPPING, `Home` for HOUSING,
   etc.). TypeScript's exhaustiveness check on `Record<CategoryKey, ...>`
   must catch any missing category, same mechanism `CATEGORY_LABELS`
   already uses.
3. Replace the emoji in the dictionary's `voiceStart` value (`'🎤 Record'`
   / `'🎤 录音'`) — split it into a plain text key plus a `Mic` icon
   rendered separately in `Composer.tsx`, since a dictionary string can't
   carry a React component. Do the same for `voiceStop`/`voiceCancel` if
   they carry emoji (check current dictionary values first).
4. Do NOT touch emoji in files with no task in this plan — e.g. if some
   other component has an emoji this plan doesn't otherwise touch, leave
   it (Constraint 9).

**Test:** exhaustiveness — deleting one entry from `CATEGORY_ICONS` should
fail `tsc`, same pattern as the existing `CATEGORY_LABELS` test convention
if one exists; if not, add one.

---

## Task 3: Toast system (Radix)

**Files:** `package.json`, new `src/components/Toaster.tsx`, new
`src/lib/toast.ts`

**Steps:**
1. `npm install @radix-ui/react-toast`.
2. Build a `<Toaster />` provider (Radix `Toast.Provider` +
   `Toast.Viewport`) mounted once in `layout.tsx` alongside
   `PersistStorageOnMount`.
3. Build a `useToast()` hook exposing `push({ variant: 'success' |
   'warning' | 'error', message, action?: { label, onClick } })` — this
   is the shape both `UndoToast` (Task 4) and `SyncWarning` (Task 5) will
   call. Toast visual treatment (left-border color, icon per variant)
   matches the artifact's toast mockups: `success` = income-green left
   border + check icon, `warning` = amber left border + triangle icon.
4. `error` variant styling: expense-red left border + circle-alert icon —
   used by any existing error-surfacing call site this plan's later tasks
   touch (not a new requirement to hunt down every error site in the app;
   only wire it where a task below already touches that code).

**Test:** pushing a toast renders it in the DOM with the correct
role (`status`/`alert` per Radix defaults) and dismisses after Radix's
default timeout or on explicit dismiss; action button fires its callback.

---

## Task 4: Rebuild UndoToast on the Toast primitive

**Files:** `src/components/UndoToast.tsx`, `src/app/page.tsx`

**Steps:**
1. Replace `UndoToast`'s current hand-rolled implementation with a call to
   `useToast().push(...)` with `variant: 'success'`, message built from
   the existing `undoneCount` dictionary interpolation, and `action: {
   label: t('undo'), onClick: onUndo }`.
2. Keep `page.tsx`'s existing `key={lastAdded.join(',')}` remount
   discipline — the comment explaining why (distinct batches need
   independent dismiss timers) still applies; verify it still holds with
   the Radix-backed implementation (Radix Toast keys by its own internal
   id, not DOM remount, so confirm this constraint is still necessary
   before deleting it — if Radix's own state model already gives distinct
   timers per `push()` call, simplify page.tsx and note why in a comment).

**Test:** existing UndoToast tests updated to assert against the new
Toast-based DOM structure instead of the old markup; undo callback and
auto-dismiss behavior both still covered.

---

## Task 5: Restyle SyncWarning on the Toast primitive

**Files:** `src/components/SyncWarning.tsx`

**Steps:**
1. Keep 100% of the existing logic (24h/72h tiers, `authError`,
   `shouldPrioritizeInstallGuidance` wiring from Plan 4) — this task is
   visual/structural only.
2. Route the banner-tier and modal-tier messages through
   `useToast().push({ variant: 'warning', ... })` where that fits the
   existing tier semantics; if the modal tier's blocking, install-nudging
   behavior doesn't fit a dismissible toast, keep it as a restyled inline
   banner using the warning tokens instead of forcing it into Toast.
   Judgment call for the implementer — document which tiers became
   toasts vs. stayed inline banners, and why, in the task report.

**Test:** all existing SyncWarning tests continue to pass against
whichever structure each tier ends up using; no behavioral regression
(same tiers fire under the same conditions as before).

---

## Task 6: History data layer

**Files:** new `src/lib/ledger/history.ts`, new
`src/lib/ledger/__tests__/history.test.ts`

**Steps:**
1. `groupByDay(transactions: Transaction[]): DayGroup[]` where
   `DayGroup = { date: string; items: Transaction[]; subtotalsByCurrency:
   { currency: string; netCents: number }[] }`. `netCents` is
   income-minus-expense for that day within that currency (a plain net
   figure for a day subtotal is fine — this is different from Stats'
   income/expense-tracked-separately rule, which applies to *period*
   totals; note this distinction explicitly in a comment so a future
   reader doesn't "fix" it to match Stats' convention). Sort groups
   newest-date-first.
2. `filterHistory(transactions: Transaction[], filter: { dateFrom?:
   string; dateTo?: string; keyword?: string }): Transaction[]` — date
   bounds use the same string-comparison pattern as `computeStats`
   (`t.date >= dateFrom && t.date <= dateTo`, each bound optional).
   Keyword match: case-insensitive substring against `merchant` OR
   `description` (not category — Global Constraint from the design
   consultation scoped keyword search to merchant/description only).
3. `recentTransactions(transactions: Transaction[], n: number):
   Transaction[]` — used by the trimmed Record page (Task 9). Returns the
   most recent `n` by whatever order `ledger.transactions` is naturally
   in; confirm that order is chronological-ascending by reading
   `replay.ts` before assuming — if it's ascending, this is
   `transactions.slice(-n).reverse()`; document the assumption inline
   with a one-line comment citing what `replay.ts` actually does.

**Test:** mixed-currency same-day transactions produce two
`subtotalsByCurrency` entries, not one summed figure (Global Constraint
2). Keyword search matches merchant-only and description-only cases
separately. Date-range filtering at exact boundary dates (inclusive) is
covered.

---

## Task 7: History page

**Files:** new `src/app/history/page.tsx`, new
`src/app/history/__tests__/page.test.tsx`

**Depends on:** Task 6 (data layer), Task 8 (MonthSwitcher).

**Steps:**
1. Default state: current month, no filter active. Render via
   `MonthSwitcher` (Task 8) + `groupByDay(filterHistory(transactions,
   { dateFrom: monthStart, dateTo: monthEnd }))`.
2. Search icon in the page header. Clicking it expands an inline panel
   (plain Tailwind disclosure, not Radix — Constraint 4) with: a date-from
   input, a date-to input, a keyword text input, and a "Clear" action.
3. **Filter-active state replaces month-scoping, does not combine with
   it** (per the user's explicit answer): when any filter field is
   non-empty, the page's data source switches from
   "`MonthSwitcher`'s current month" to "`filterHistory` across the full
   `transactions` array using the filter's own date bounds (which may be
   empty, meaning unbounded)." The `MonthSwitcher` control should visually
   indicate it's inactive while a filter is applied. Clearing the filter
   returns to month-scoped browsing, defaulting back to the *current*
   month (Ruling: do not try to restore whatever month was last browsed
   before the filter was applied — simpler, and matches the "always opens
   on current month" behavior decided for the page overall).
4. Each day group renders its header (localized date), its
   per-currency subtotal chip(s) from `subtotalsByCurrency`, then its
   `TransactionRow` items.
5. Empty state: reuse the `emptyLedger` dictionary key if no filter is
   active and the month has zero transactions; add a new `historyNoResults`
   key ("No matching records — try a different date range or keyword." /
   "没有匹配的记录，试试换个日期范围或关键词。") for the filtered-empty
   case, since these are different situations and should say different
   things (Constraint 8 — additive keys, don't reuse `emptyLedger`'s
   meaning for a different case).

**New DictKeys:** `navHistory`, `historySearchLabel`, `historyDateFrom`,
`historyDateTo`, `historyKeywordPlaceholder`, `historyClearFilter`,
`historyNoResults`.

**Test:** month switch changes the visible set; applying a keyword filter
spanning multiple months returns matches from outside the currently-
browsed month (proves the "search escapes month-scoping" requirement is
actually implemented, not just visually plausible); clearing a filter
returns to the current month, not the month that was active before
filtering.

---

## Task 8: Shared MonthSwitcher

**Files:** new `src/components/MonthSwitcher.tsx`, new
`src/lib/ledger/useMonthNav.ts` (or fold the hook into the component if
the implementer judges a standalone hook is unnecessary indirection for
two call sites — note the choice either way)

**Steps:**
1. `MonthSwitcher({ month, onChange, earliestMonth }: { month: Date;
   onChange: (next: Date) => void; earliestMonth: Date | null })` — renders
   `‹ September 2026 ›` (localized month name per `locale`), disables the
   `›` (next) control when `month` is the current calendar month (no
   browsing into the future), disables `‹` (prev) when `month` equals
   `earliestMonth` or `earliestMonth` is null (no transactions at all yet).
2. `earliestMonth` is derived by the caller from `transactions[0]?.date`
   or similar — do not compute it inside `MonthSwitcher` itself, keeping
   it a pure presentational component consistent with this codebase's
   existing convention of keeping derivation in the caller/`useMemo`
   (see `page.tsx`'s existing comment about not filtering inside
   `getSnapshot`).
3. Both Task 7 (History) and Task 11 (Stats) consume this component and
   drive their own `computeStats`/`filterHistory` calls off the resulting
   `month` state — `MonthSwitcher` itself has no knowledge of stats or
   history.

**Test:** boundary disabling at both ends; month-name localization in
both `en` and `zh`.

---

## Task 9: Trim the Record (home) page

**Files:** `src/app/page.tsx`, `src/components/LedgerList.tsx` (reused,
not rewritten)

**Steps:**
1. Replace `<LedgerList transactions={transactions} />` with
   `<LedgerList transactions={recentTransactions(transactions, 10)} />`
   (10 as the starting "recent N" — call this out as a Ruling in the
   implementer's report rather than treating it as load-bearing; easy to
   tune later, not worth a user round-trip).
2. Add a "View history →" link/button below the trimmed list routing to
   `/history`. New `DictKey`: `viewAllHistory` ("View all history" /
   "查看全部历史").
3. Apply Task 1's tokens/fonts to the page's existing structure — this is
   a visual pass on top of the trim, not a structural rewrite of the
   composer/pending-row/queued-row logic, all of which is unchanged.

**Test:** with more than 10 transactions in the store, the page renders
exactly the most recent 10 (per whatever ordering Task 6 established) and
shows the "View history" link; with 10 or fewer, the link still renders
(going to History is always available, not conditional on overflow).

---

## Task 10: BottomNav → 3 tabs

**Files:** `src/components/BottomNav.tsx`,
`src/components/__tests__/BottomNav.test.tsx`

**Steps:**
1. Add a `/history` link between the existing Ledger and Stats links,
   using the new `navHistory` dict key and a lucide icon (e.g. `History`
   or `ScrollText`).
2. Update the file's existing top-comment (`"底部只有记账/统计两个 tab"`)
   — it's now stale and describes the old 2-tab state.
3. Restyle per Task 1 tokens (active-tab indication using `--brand`, not
   a color that could be confused with income/expense).

**Test:** `aria-current="page"` fires correctly on `/history` same as it
already does for `/` and `/stats`.

---

## Task 11: Stats — month-only, no charts

**Files:** `src/app/stats/page.tsx`, `src/lib/ledger/stats.ts`,
`src/app/stats/__tests__/page.test.tsx`

**Steps:**
1. Remove `'week'` from `StatsPeriod` entirely — it becomes a type alias
   or is deleted outright if nothing else references the union
   (`export type StatsPeriod = 'month'` is probably pointless once it's
   a single value; consider whether `computeStats`/`periodRange` still
   need a `period` parameter at all, or whether they collapse to just
   taking a `referenceDate` since month is now the only mode — implementer's
   call, but if collapsed, update every call site including any tests
   asserting the old two-argument-style signature).
2. Delete the `statsTabWeek`/`statsTabMonth` toggle buttons; replace with
   `MonthSwitcher` (Task 8) driving `computeStats`'s `referenceDate`.
3. `statsPrev`/`statsNext` dictionary keys were already unused dead code
   per Plan 4's own deferred-minors list — either wire them into
   `MonthSwitcher`'s labels (if it needs text alongside the ‹ › glyphs) or
   delete them; do not leave them unused a second time.
4. Do NOT add any chart/donut/bar visualization (Global Constraint 5) —
   category rows stay plain text: label + amount, exactly as Plan 4 
   shipped them, just restyled with Task 1's tokens.

**Test:** switching months via `MonthSwitcher` recomputes stats for that
month; deleting the week code path doesn't break any currency-grouping or
category-aggregation test inherited from Plan 4.

---

## Task 12: Login / Marketing page rebuild

**Files:** new `src/components/marketing/Hero.tsx`,
`src/components/marketing/CaptureDemo.tsx`,
`src/components/marketing/StatStrip.tsx`,
`src/components/marketing/FeatureGrid.tsx`, `src/app/login/page.tsx`

**Steps:**
1. Build each section as an independent component taking no required
   props beyond `t`/`locale` context (Constraint from the consultation:
   "componentized so sections can be trimmed/reordered later") — no
   section should depend on another section's internal state.
2. `Hero`: gradient headline, subheading, primary CTA (`logInAction`,
   routes to `/api/auth/login` exactly as today) + secondary ghost button
   (new `DictKey`: `heroSecondaryCta`, e.g. "See how it works" — link
   target is a Ruling for the implementer: either scroll-anchor to the
   `FeatureGrid` section or do nothing/omit the button if no sensible
   target exists yet; do not invent a fake destination).
3. `CaptureDemo`: static (non-functional) mockup matching the artifact's
   mic-orb → waveform → transcript → categorized-row sequence. This is
   marketing decoration, not a live feature — do not wire it to actual
   STT/AI calls.
4. `StatStrip`: the three capability callouts from the artifact (`<3s`,
   `100%`, `0`) as static copy, each with a new `DictKey` pair (number +
   label).
5. `FeatureGrid`: 4 cards (voice input, auto-categorization, offline,
   local-first privacy) with lucide icons (Task 2's library) and new
   `DictKey`s per card.
6. Assemble in `login/page.tsx`: keep the existing already-logged-in
   redirect logic and the `backToLedger` fallback link untouched — this
   task only replaces what renders when the user is logged out.

**New DictKeys:** section headline/subhead, `heroSecondaryCta`, 3×
stat-number/label pairs, 4× feature title/description pairs (a real
count — enumerate them exactly in the task brief, don't leave the
implementer guessing key names).

**Test:** each marketing section renders independently in isolation
(component-level tests, not just an integration render of the full page)
— proves the "componentized, can be trimmed independently" requirement
is actually true and not just true-by-accident of how they happen to be
assembled today.

---

## Task 13: Dark mode verification pass

**Files:** none new — this is a verification task across everything Tasks
1-12 touched.

**Steps:**
1. Render every restyled page/component with `prefers-color-scheme: dark`
   emulated and visually confirm (browser tool, not just code-reading)
   that: text stays legible against its background, the brand
   gradient still reads, income/expense colors are still visually
   distinct from each other and from brand, and no element is only
   defined in the light token set (the classic bug the `artifact-design`
   contract calls out).
2. Fix anything found directly in this task rather than filing it as a
   deferred minor — dark mode is Global Constraint 3, not optional
   polish.

**Test:** N/A (visual verification task) — report findings/fixes in the
task report instead of a written test.

---

## Task 14: Remaining component polish pass

**Files:** `src/components/EditForm.tsx`, `src/components/TransactionRow.tsx`
(styling only, no logic changes), `src/app/settings/page.tsx`,
`src/components/InstallBanner.tsx`

**Steps:**
1. Apply Task 1's tokens to every component this plan's earlier tasks
   didn't already restyle. Purely visual — every existing behavior,
   prop, and test from Plan 3/4 stays intact.
2. Apply `font-variant-numeric: tabular-nums` (via the mono font
   utility) to every rendered monetary amount, per Task 1 step 4's
   deferred item.
3. `TransactionRow`'s category display gets its `CATEGORY_ICONS` icon
   (Task 2) alongside the existing text label — not replacing the label,
   since icon-only category identification isn't accessible without a
   text alternative.

**Test:** existing test suites for all four files continue passing
unmodified (proves this task didn't touch behavior) — this task should
have zero test diffs beyond what a class-name-only change might
incidentally require (e.g. `getByRole`/`getByText` queries breaking
because text moved — acceptable to fix, but assertions about behavior
must not change).

---

## Task 15: Responsive / desktop layout

**Files:** `src/app/history/page.tsx`, `src/app/stats/page.tsx`,
`src/components/BottomNav.tsx` (or a new `SidebarNav.tsx` for the desktop
breakpoint), `src/app/globals.css`

**Steps:**
1. Below a `md`/`lg` Tailwind breakpoint: current mobile layout,
   unchanged.
2. At/above that breakpoint: History and Stats switch to a side-by-side
   panel layout (e.g. month list/day groups in one column, a detail or
   totals panel alongside — concrete composition is the implementer's
   call, informed by the artifact's desktop mockup, but Global Constraint
   5 still applies: no charts fill that second panel, use it for
   category/day totals instead).
3. `BottomNav` either hides at the desktop breakpoint in favor of a
   sidebar variant, or the implementer judges the bottom nav still reads
   fine at desktop width and a sidebar isn't worth the added component —
   this is explicitly a judgment call given Global Constraint 10 only
   requires the page *content* layout to be real, not that every nav
   pattern must change; if skipping the sidebar, say so and why in the
   task report rather than silently doing less than the plan implies.
4. Login/marketing page (Task 12) already targets desktop-first in its
   artifact mockup — verify it degrades sensibly at mobile width too
   (the artifact's hero is 2-column; confirm it collapses to 1-column
   below the same breakpoint used elsewhere, consistent spacing).

**Test:** viewport-width-driven visual verification (browser tool at both
a mobile and desktop viewport size) rather than a unit test — report
screenshots or descriptions of both states in the task report.

---

## Final whole-branch review

Same process as Plan 4: after all 15 tasks land, dispatch one
whole-branch review (opus) over the full diff range, one fix wave if
needed, one scoped re-review, then `finishing-a-development-branch`.
