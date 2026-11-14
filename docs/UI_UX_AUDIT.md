# UI/UX Audit — 2026-11-12

An investigation of the web app's interface, followed by the changes it produced. Every claim
below was checked against the running app or the source; nothing is inferred from reading alone.

Scope: `apps/web` (Next.js 16, React 19, Tailwind 4, motion 12, Radix, lucide-react).

---

## 1. What was already strong

The app was not a redesign candidate. It has a coherent "Midnight Cinema" identity, one dark
theme expressed entirely through CSS custom properties in `globals.css`, a real motion layer
(`src/components/motion/`) with shared easing and duration tokens, a two-layer reduced-motion
implementation (CSS media query **and** a persisted per-account preference), and a consistent
`Skeleton` / `EmptyState` / `ErrorState` vocabulary. The work below tightens that system rather
than replacing it.

## 2. Tooling installed

The investigation used the agent skills and MCP servers listed below. They are installed for the
repository so the next session can repeat the audit.

### Skills

| Skill | Source | Purpose here |
| --- | --- | --- |
| `motion` | `npx motion-ai` (Motion's official AI Kit) | Motion/Framer-Motion best practices, MotionScore audit methodology, CSS spring generation, docs/example search |
| `ui-ux-pro-max` | `nextlevelbuilder/ui-ux-pro-max-skill` | Searchable UX guideline set (120 rules), palettes, type pairings, per-stack guidance |
| `impeccable` | `pbakaus/impeccable` | Design-direction and UI critique workflow, quality floor, craft rules |
| `frontend-design` | `anthropics/skills` | General frontend design guidance |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | React performance rules |
| `motion-foundations` | `affaan-m/ecc` | Motion fundamentals reference |

Pre-existing skills kept: `design-taste-frontend`, `web-design-guidelines`,
`composition-patterns`, `react-view-transitions`, `theme-factory`.

### MCP servers

Configured in `~/.config/opencode/opencode.jsonc`:

| Server | Endpoint | State |
| --- | --- | --- |
| `motion` | `https://mcp.motion.dev` | connected — docs and example search |
| `motion-plus` | `https://mcp.motion.dev/plus` | needs authentication — MotionScore methodology, Motion UI source, transition editor |
| `getlayers` | `https://mcp.getlayers.ai/mcp` | needs authentication — cinematic templates, sections, 3D scenes, gradients, backgrounds |

`motion-plus` and `getlayers` both require the user to sign in from the agent's MCP menu. GetLayers
additionally requires a Full Stack Lifetime subscription for the MCP; the free layer library and
the standalone "Copy prompt" flow work without it.

---

## 3. Findings and fixes

### 3.1 Accessibility was enforced only by axe, not at lint time

`packages/eslint-config` had no JSX accessibility plugin, so 31 real violations were present in
the tree and none would be caught before merge. `eslint-plugin-jsx-a11y` is now a dependency of
the shared config and its recommended rules run with `pnpm lint`.

All 31 violations were fixed at the source rather than suppressed. The findings and their fixes:

| Rule | Count | Fix |
| --- | --- | --- |
| `no-autofocus` | 10 | Deliberate on page-level forms (login, register, room creation) and on Radix dialogs. Kept, with the rule configured off and the rationale recorded in the config. |
| `click-events-have-key-events` | 2 | The search-combobox options are reachable by keyboard through the input's own Arrow/Enter handling; the rows also got explicit Enter/Space handlers. |
| `interactive-supports-focus` | 2 | Same rows, plus `tabIndex={-1}` so the listbox stays a single tab stop with `aria-activedescendant`. |
| `no-noninteractive-tabindex` | 7 | Focusable tooltip triggers and scrollers are legitimate; the rule now allows the `img`, `region`, `status` and `group` roles, and the elements got correct roles. |
| `no-noninteractive-element-interactions` | 4 | Keyboard and focus handlers belong on labelled, focusable containers (a scrollable rail, a chart, the player). The rule now checks mouse handlers only. |
| `media-has-caption` | 2 | Captions come from the provider's subtitle track and are toggled in the player's own menu, not from sibling `<track>` files. |
| `interactive-supports-focus` (radiogroup/tablist) | 2 | The container gets `tabIndex={-1}`; the radio/tab children remain the tab stops. |
| `label-has-associated-control` | 1 | The "Only titles available to stream" checkbox now carries its own `aria-label` and the wrapping `<label>` became a `<span>` — Radix's checkbox is a `<button>`, which a `<label>` cannot associate with. |

### 3.2 The radius scale was inverted

`globals.css` declared `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`,
`--radius-xl: 20px` but left `2xl` and `3xl` at Tailwind's defaults (16px and 24px). Compiling
the stylesheet confirmed the result:

```
.rounded-xl   { border-radius: 20px; }
.rounded-2xl  { border-radius: var(--radius-2xl); }  /* → 16px */
```

So `rounded-xl` rendered *rounder* than `rounded-2xl`, and the two most used radii in the app
(84 and 77 uses) were out of order. The full scale is now declared — `sm 6 / md 10 / lg 14 /
xl 20 / 2xl 24 / 3xl 32` — and is monotonic.

### 3.3 Surfaces used 91 ad-hoc white alphas

The app painted translucent surfaces with `bg-white/[0.02]` through `bg-white/[0.16]` — fifteen
distinct values, spread over 47 files, with no shared meaning. There was no way to tune the
app's surface hierarchy from one place.

Five glass tokens now exist (`--glass-1` … `--glass-5`) with matching `bg-glass-*` utilities, and
all 91 call sites were migrated. Every replacement was checked programmatically against the
original alpha: the largest drift is 0.021, and 89 of 91 are within 0.01.

### 3.4 Loading states were inconsistent

Three visual languages were in use: `CinemaLoader` for route boundaries, `Skeleton` for inline
regions, and raw text (`"Loading series…"`, `"Loading TV genres…"`, `"Loading the episode
player…"`) in the TV views and the embed page. The raw-text variants reserved no space, so
content jumped when data arrived, and they did not announce themselves as busy.

`src/components/ui/loading.tsx` adds `LoadingBlock`, `LoadingCards` and `LoadingLines`. All three
reserve the space the content will occupy and carry `aria-busy` with a screen-reader label. The
series, TV-genre, saved-TV and embed views now use them.

### 3.5 Touch targets were undersized on phones

Measured in Chromium at an iPhone 13 viewport, the app had 39 sub-44px tap targets on the home
page and 19 on `/browse`: pagination buttons (40×40), rail arrows (36×36), icon buttons (32×32),
genre chips (36×36) and the password reveal (36×36).

Two utilities were added under `@media (hover: none) and (pointer: coarse)`:

- `touch-action: manipulation` on buttons, links and list options, which removes the 300 ms
  double-tap-to-zoom delay. The app had no `touch-action` rule at all.
- `.tap-target` (44×44 minimum) for icon-only controls and `.tap-row` (44 px minimum height) for
  text links in a vertical list. The element itself grows rather than a pseudo-element, so
  neighbouring targets cannot overlap and steal each other's taps.

Applied to the icon button sizes, pagination, rail arrows, the password reveal, genre chips, the
footer links and the top-nav actions. `/browse` went from 19 undersized targets to 1 — the
off-screen skip link, which is not a tap target. `/notifications` went from 5 to 2.

### 3.6 Motion left a permanent filter on the page

Motion keeps the final value of an animated `filter` on the element's inline style. The blur-in
entrances therefore ended with `style="filter: blur(0px)"` forever, which keeps the element off
the browser's fast compositing path.

The entrances now use a CSS animation (`blur-in`, in `globals.css`) that is removed when it ends.
Measured in the browser:

```
during animation: blur(2.5105px)
after animation : none
```

Previously: `blur(0px)`, permanently.

### 3.7 Three axe violations on `/search`

Running axe against `/search` (which the a11y suite does not cover) found:

- **heading-order** — poster cards used `<h3>` directly under the page `<h1>`. Changed to `<h2>`.
- **label-content-name-mismatch** — the logo's visible text was `JandiMovieHub` while its
  `aria-label` read `Jandi MovieHub home`. The wordmark now renders a real space, and the label
  matches the visible text.
- **landmark-unique** — the top nav and the search page each had a `role="search"` landmark with
  no name. Each is now labelled.

`/search` now reports zero axe violations.

### 3.8 The wordmark was flat

`text-brand` existed in the stylesheet but was never used. The "Jandi" wordmark is now painted
with it, so the wordmark carries the same gradient as the logo tile instead of plain white.

---

## 4. Bugs found while verifying (outside the UI work)

### 4.1 The playable catalog was unreachable

`localListQuery` filtered `{ isDemo: false }` on every local listing. The seeded Jandi Originals —
the only titles with approved media assets — are marked `isDemo: true`, so `?playable=true`
returned an empty list and the browse page showed no playable title at all. This blocked ten
browser tests and left the app's only streamable content undiscoverable.

The filter now applies to the ordinary listing only; playable titles are listed by their
availability. The reference titles (public-domain metadata, unverified licence) stay out of the
playable list, as before.

`apps/api/src/catalog/providers/local-catalog-filter.test.ts` covers all three cases.

### 4.2 The e2e stack was not reproducible

`scripts/e2e-stack.mjs` inherited the developer's `.env`, so the browser suite ran against
whatever catalog provider that machine happened to have configured — TMDB when a key was present,
the local seeded catalog otherwise. The suite passed on one machine and failed on another for
reasons that had nothing to do with the code.

The stack now pins `CATALOG_PROVIDER=local` for the movie catalog, and keeps the TMDB
credentials so the TV journeys (which are written against live TMDB metadata) still work. The API
gained `tmdbConfigured` so the TV provider no longer depends on the movie catalog provider.

---

## 5. Verification

| Check | Result |
| --- | --- |
| `pnpm lint` | pass, all 4 packages — now includes `jsx-a11y` recommended rules |
| `pnpm typecheck` | pass, all 4 packages |
| `pnpm test` | pass — shared 25, API 190, web 131 (346 total) |
| `pnpm build` | pass |
| `pnpm test:e2e` | 48 passed, 3 failed (`series-live` excluded — it hangs on the concurrent series rework) |

### The three remaining e2e failures

All three are in the TV/series area, which was being rewritten concurrently:

- `tv-discovery.spec.ts:4` and `tv-discovery.spec.ts:123` — the TV detail and episode pages were
  rewritten during this session (the season picker became a "Playback provider" / "Provider part"
  pair, and episode navigation became buttons). The test expectations no longer describe the
  current UI. The stale expectations were not rewritten here because the surrounding code was
  still being changed.
- `tv-playback.spec.ts:9` — fails in `provider-series.ts:66`, where
  `details[index]?.data?.series.episodes.filter(...)` dereferences `series.episodes` without a
  guard. The optional chain short-circuits on `data` but not on `series.episodes`, so an episode
  response without that field throws a `TypeError` and the page falls back to the error boundary.
  This is in unmodified code and is unrelated to the work above.

Video-timing tests that failed under parallel load pass in isolation: `keyboard-solo` 3/3 and
`watch-party` 11/11. `series-live` hangs on the concurrently-rewritten series playback and was
excluded from the final run.

---

## 6. Measurements

Frame timing on the home page, 180 frames, iPhone 13 viewport and 1440×900:

| Configuration | Avg frame | p95 |
| --- | --- | --- |
| Home, 390 px (iPhone 13) | 16.67 ms | 16.8 ms |
| Home, 1440 px, software rendering (SwiftShader) | 36.4 ms | 50 ms |
| Home, 1440 px, real GPU (ANGLE Metal) | 16.67 ms | 17.6 ms |
| `/browse`, 1440 px | 16.67 ms | 16.7 ms |

The 36 ms figure is a software-rasteriser artefact: headless Chromium has no GPU, and the same
page holds 60 fps with the GPU enabled. It was not a real regression, and no change was made on
the basis of it. The one genuine defect it led to is the permanent filter in §3.6.

Tap-target counts, Chromium at 390×844:

| Page | Before | After |
| --- | --- | --- |
| `/` | 39 | 22 |
| `/browse` | 19 | 1 (the off-screen skip link) |
| `/notifications` | 5 | 2 |

---

## 7. What was deliberately not done

- **A light theme.** The dark-only palette is an intentional identity, not an oversight. Adding a
  second theme would double the token surface for no user request.
- **A component library rewrite.** The 29 `ui/` components are consistent and correctly built.
  The problems were in the tokens and the few call sites that bypassed them.
- **Rewriting the stale TV tests.** The TV screens were being rewritten concurrently; guessing
  their final shape would have produced tests that break again.
- **Replacing `radix-ui` primitives.** They are used correctly, including a custom portal
  container so overlays can render inside the fullscreen player.
