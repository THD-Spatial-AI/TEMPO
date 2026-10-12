# Plan: restyle the TEMPO app to match the landing page

**Goal:** the desktop app and the landing page share one structure and one aesthetic. Someone who goes from the website into the app should see the same product.

**Source of truth: the landing page** (`landing/tailwind.config.js`, `landing/src/index.css`, `landing/src/components/*`). **Only the app changes.** No file under `landing/` is touched.

**Decisions (Ricardo, 2026-10-12):**
- The app adopts the landing aesthetic, not the other way round.
- Navigation: **keep the current left sidebar** (same layout and items), styled like the landing header.
- Uppercase as on the landing page is fine, including labels, nav, buttons and headers.
- Fonts and icons are **bundled with the app** (they must work offline in Electron).
- Icons: **Material Symbols Outlined**, the same set as the landing page.
- Screenshots for the landing page: **Ricardo re-captures them himself** after the restyle (out of scope here).

---

## 1. Audit: what the app must change

| # | Aspect | Landing (target) | App (current) | Size of change in the app |
|---|---|---|---|---|
| A1 | **Font** | `Inter` 400–900 | `DM Sans` (Google Fonts link) + `JetBrains Mono` | Small. Bundle Inter via `@fontsource-variable/inter`; keep JetBrains Mono for code/YAML/logs, bundle it too (`@fontsource-variable/jetbrains-mono`) and drop the Google link. |
| A2 | **Corners** | Square: every radius `0px` except `full` | 1,336 `rounded*` uses in 91 files | **Small via config**: copy the landing `borderRadius` override. Then check the places that must stay round (dots, spinners, toggles, avatars) use `rounded-full`. |
| A3 | **Palette** | Material-3 tokens: `background/surface #faf8ff`, `surface-container-*` #f2f3ff→#dae2fd, `primary #000`, `on-surface #131b2e`, `secondary #505f76`, `outline #777`, `outline-variant #c6c6c6`, `error #ba1a1a` | `electric-*` (gray scale) + raw `slate-*`/`gray-*` everywhere | Medium. Add the landing tokens; remap `electric` 500/600/700 to black (`#3b3b3b`/`#000`/`#000`) so the existing accent classes turn black; swap the most visible surfaces (`bg-slate-50` → `bg-surface`, white cards → `bg-surface-container-lowest`). Raw `slate-*` text colours stay (already close). |
| A4 | **Page background** | Flat `#faf8ff`, `.grid-bg` dot grid | `slate-50` + mesh gradient + two pulsing blurred blobs (`App.jsx:125-128`) | Small |
| A5 | **Type voice** | `uppercase` labels/nav/buttons/eyebrows, `font-bold`/`font-black`, `tracking-tighter` on headings, `tracking-widest` on micro labels (`text-[10px]`, `text-[0.6875rem]`) | Sentence case, `font-medium`/`font-semibold` | **Large**, done through shared components and page headers. Data values, model/tech/location names and numbers stay as typed (uppercasing user data changes how it reads, e.g. `pv_rooftop`). |
| A6 | **Buttons** | Solid black `bg-primary text-on-primary`, square, `font-bold uppercase tracking-wide`, `hover:opacity-80`; secondary = black outline | `ui/Button.jsx` `rounded-lg bg-gray-600 shadow-sm`; `.btn-primary` grey gradient + `hover:scale-105` | Medium: component + CSS classes, then sweep inline buttons |
| A7 | **Cards / panels** | Flat, `bg-surface-container-lowest`, `border border-black/15` or `.ghost-border`, no shadow, no hover lift | `Card.jsx` `rounded-2xl shadow-sm`, `.card-refined` lift, `DashboardWidgets` `Panel`, `KpiCard`, `Modal` | Medium |
| A8 | **Shadows** | Almost none; separation by lines | `shadow-sm` ×101, `shadow` ×53, `shadow-lg` ×45 | Small via config: `sm`/`DEFAULT`/`md` → `none`; keep `lg`/`xl`/`2xl` for floating menus, modals, map popups. |
| A9 | **Icons** | Material Symbols Outlined (`FILL 0`, `wght 300`) | Feather `react-icons/fi`: **78 files, 91 distinct icons**; `@mui/icons-material` in 1 file | **Large, mechanical.** Bundle via the `material-symbols` npm package. |
| A10 | **Sidebar** | Landing header language: `bg-[#FAF8FF]`, `border-black/15`, wordmark `font-black uppercase tracking-tighter`, links `font-semibold uppercase tracking-tight text-black/60 hover:text-black`, active = black `border-b-2` underline | `Sidebar.jsx`: translucent white, rounded items, active = grey gradient pill | Medium: same structure and items, new styling. Active = `border-l-2 border-black` + `text-black` (the vertical version of the landing underline). |
| A11 | **Badges** | Square `text-[10px] font-bold uppercase tracking-widest` | `rounded-full` pills | Small |
| A12 | **Focus / accent** | Black | `ring-gray-500`, `accent-color #111827` | Small |
| A13 | **Charts** | Greyscale / black | Mostly greyscale already; leftover hex `#6366f1` (indigo, ×15), `#f59e0b` (amber, ×13) | Small: map leftovers to landing greys; keep colours that carry meaning (tech colours, map data layers). |
| A14 | **Map / React Flow chrome** | — | Leaflet popup `border-radius: 8px` | Small: square popups; markers stay round. |

**Do not change:** logic, data, chart semantics, map data colours, anything under `landing/`.

---

## 2. Approach

Most of the change happens at the **token level** (root `tailwind.config.js` + `src/index.css`): radius, shadow, font and the `electric-*` remap restyle the whole app with a few dozen lines. Components and page sweeps come after. Each phase is checked on its own with `npm run dev:electron`.

Tokens are **copied** from `landing/` (with a comment naming the source file), not imported across folders, so the app build and electron-builder do not depend on `landing/`.

### Phase 1: tokens, fonts, base CSS
1. `npm i @fontsource-variable/inter @fontsource-variable/jetbrains-mono`; import both in `src/main.jsx`; remove the Google Fonts `<link>`/preload from `index.html`.
2. `tailwind.config.js`:
   - `fontFamily.sans` → `['Inter Variable', 'Inter', …]`, `mono` → `['JetBrains Mono Variable', …]`; add the landing `headline/body/label/inter` aliases.
   - Landing `borderRadius` override (all `0px`, `full: 9999px`).
   - Landing Material-3 colour tokens.
   - `electric` remap: 50–200 → landing surfaces, 500/600/700 → black range.
   - `boxShadow` `sm`/`DEFAULT`/`md` → `none`; remove `glow`.
3. `src/index.css`:
   - `body`: `#faf8ff`, no mesh; `--font-display` → Inter.
   - Headings `font-weight 900; letter-spacing -0.05em`.
   - Add `.grid-bg`, `.ghost-border`, `.technical-frost`, `.logo-on-light` from `landing/src/index.css`.
   - `.btn-primary` / `.btn-secondary` / `.card-refined` / `.input-refined` → landing look (black solid / black outline / flat bordered / square input, black focus).
   - `accent-color: #000`; Leaflet popup radius 0.
4. `App.jsx`: remove the pulsing blobs (lines 125–128).

→ **verify:** `npm run build` passes; in `npm run dev:electron` every view is square, Inter, flat, black accent; no card disappears into the background now that shadows are gone (add `border border-black/15` where one does). With the network disabled, fonts still load.

### Phase 2: shared components
5. `ui/Button.jsx`: primary `bg-primary text-on-primary font-bold uppercase tracking-wide hover:opacity-80`; outline `border border-black text-black hover:bg-black hover:text-white`; ghost `text-black/60 hover:text-black`; focus `ring-black`.
6. `ui/Card.jsx`, `ui/Modal.jsx`, `ui/KpiCard.jsx`, `dashboard/DashboardWidgets.jsx` (`Panel`, `KpiCard`): `bg-surface-container-lowest border border-black/15`; titles `text-[0.6875rem] font-bold uppercase tracking-widest`; KPI values `font-black tracking-tighter`.
7. `ui/Badge.jsx`: square uppercase micro-label.
8. `ui/SaveBar.jsx`, `Notification.jsx`, `ErrorBoundary.jsx`, `SetupScreen.jsx`, `PrivacyDialog.jsx`: same treatment.

→ **verify:** Dashboard and Settings next to the landing Home page: buttons, panels and labels read as one family.

### Phase 3: sidebar + page headers + sweep
9. `Sidebar.jsx`: keep the structure (items, "Structure" group, collapse toggle, widths). Restyle: `bg-[#FAF8FF] border-r border-black/15`, no blur/shadow; logo with `logo-on-light` + `TEMPO` wordmark `font-black uppercase tracking-tighter`; items `text-[0.8125rem] font-semibold uppercase tracking-tight text-black/60 hover:text-black`; active `text-black border-l-2 border-black bg-surface-container-low`; remove the gradient pill and `drop-shadow`.
10. Page headers for every view (Dashboard, Tutorial, Creation, Models, Map View, Locations, Links, TimeSeries, Scenarios, Scenario Studio, Tech Database, Export, Run, Results, Settings): eyebrow `text-[0.6875rem] font-bold uppercase tracking-widest text-black/60` + title `font-black tracking-tighter`, like the landing section headers.
11. Sweep inline styles that bypass the components, largest areas first: `Results` + `results/`, `Creation` + `creation/`, `ScenarioStudio` + `scenarioStudio/`, `Run` + `run/`, `Settings`, `TimeSeries` + `timeseries/`, `MapView` + `map/`, then the rest. Replace hand-rolled `bg-gray-600 rounded-lg` buttons with `<Button>`, shadowed cards with the flat panel, field labels and table headers in uppercase micro-label style; remove `bg-gradient-to-*` and `hover:scale-*`. Fix chart hex leftovers (A13).

→ **verify:** walk through all views + Setup wizard + Tutorial + modals; `grep -rn "bg-gradient-to\|hover:scale" src` returns only deliberate uses.

### Phase 4: icons → Material Symbols
12. `npm i material-symbols`; import `material-symbols/outlined.css` in `src/main.jsx`; copy the landing `.material-symbols-outlined` rule (`FILL 0, wght 300, GRAD 0, opsz 24`).
13. `src/components/ui/Icon.jsx`: `<Icon name="home" className="text-lg" />` → `<span className="material-symbols-outlined" aria-hidden="true">home</span>`; size follows `text-*` as on the landing page.
14. Replace the 91 Feather icons file by file (78 files) with one fixed mapping, using the landing's names where both exist. For example: `FiHome→home`, `FiBook→menu_book`, `FiEdit→edit`, `FiFolder→folder`, `FiGrid→grid_view`, `FiMap→map`, `FiMapPin→location_on`, `FiActivity→timeline`, `FiBarChart2→bar_chart`, `FiLayers→layers`, `FiCpu→memory`, `FiDownload→download`, `FiPlay→play_arrow`, `FiPieChart→pie_chart`, `FiSettings→settings`, `FiZap→bolt`, `FiDollarSign→payments`, `FiChevronDown→expand_more`, `FiChevronRight→chevron_right`, `FiChevronsRight→keyboard_double_arrow_right`, `FiX→close`, `FiPlus→add`, `FiTrash2→delete`, `FiSun→wb_sunny`, `FiClock→schedule`, `FiFilter→filter_list`, `FiLink→link`. The full table goes in the PR description.
15. Props that pass icon components (`Sidebar` `Icon={FiHome}`, `DashboardWidgets`, any icon maps in `results/`) change to `icon="home"` strings.
16. Remove `react-icons` (and `@mui/icons-material` if unused) from `package.json`.

→ **verify:** `grep -rn "react-icons" src` is empty; with the network disabled every icon renders as a glyph (no raw ligature text like "home" and no empty boxes).

### Phase 5: final check
17. App (`npm run dev:electron`) and landing (`cd landing && npm run dev`) side by side: sidebar vs header, buttons, panels, badges, headings, icons, background.
18. `npm run lint`, `npm test`, `npm run build`; one model end-to-end (Run → Results → map) to confirm nothing functional broke.
19. Ricardo re-captures the landing screenshots and commits.

---

## 3. Out of scope
- Any change under `landing/` (code or images).
- Landing screenshots (Ricardo).
- Logic, data, engine or backend changes.
- Dark mode.
