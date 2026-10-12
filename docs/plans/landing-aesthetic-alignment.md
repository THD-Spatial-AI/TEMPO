# Plan: align the landing page aesthetic with the TEMPO app

**Goal:** someone who visits the landing page and then opens the desktop app should feel they are in the same product. Today they would not: the landing page is a square-cornered, all-caps, Inter and Material-3 "brutalist" design, while the app is a soft, rounded, DM Sans, slate/grey "technical-industrial" design.

**Source of truth:** the app (`tailwind.config.js`, `src/index.css`, `src/components/ui/*`, `src/components/Sidebar.jsx`). The landing page changes to match it. The app does not change.

---

## 1. Audit: where the landing page differs from the app

| # | Aspect | App (target) | Landing (current) | Size of change |
|---|---|---|---|---|
| A1 | **Font** | `DM Sans` for UI, `JetBrains Mono` for code (`index.html` preload, `--font-display`, Tailwind `sans`/`mono`) | `Inter` for everything (`font-headline/body/label/inter`) | Small: one `<link>` and the config |
| A2 | **Corner radius** | Rounded: `rounded-lg` (490 uses), `rounded-xl` (190), `rounded-2xl` (71) for cards and modals | **Every radius forced to `0px`** in `tailwind.config.js` (`borderRadius` override) | Small in config, but every card/button/image has to be checked |
| A3 | **Palette** | Neutral grey/slate: `electric-*` (gray-50…950), `slate-*`, `gray-*`. Background `slate-50` (#f8fafc) | Material-3 token set with a **blue tint**: `background #faf8ff`, `surface-container #eaedff`, `secondary #505f76`, `surface-dim #d2d9f4`, plus `primary #000` | Medium: about 50 tokens to remap or drop |
| A4 | **Page background** | `slate-50` with a soft radial "mesh" gradient (`--gradient-mesh`) | Flat `#faf8ff` and a dot-grid (`.grid-bg`), plus a Three.js `DottedSurface` | Small |
| A5 | **Type voice** | Sentence case. `font-medium` / `font-semibold`, headings `font-weight 600`, `letter-spacing -0.025em`. Uppercase only on small KPI labels (`text-[10px] uppercase tracking-wide`) | **168 `uppercase`**, 132 `font-bold`, 55 `font-black`, `tracking-widest`/`tracking-[0.2em]`, many `text-[10px]`/`text-[11px]` sizes | **Large**: the biggest visual difference, touches every page |
| A6 | **Buttons** | `rounded-lg`, `bg-gray-600 hover:bg-gray-700`, `shadow-sm`, `font-medium`, focus ring `ring-gray-500` (`ui/Button.jsx`); `.btn-primary` is a grey-500→900 gradient | Square, solid black `bg-primary`, `font-bold tracking-wide`, `hover:opacity-80` | Medium |
| A7 | **Cards / panels** | `rounded-2xl border border-gray-200 bg-white shadow-sm`, header row with `border-b border-gray-100` (`ui/Card.jsx`) | Flat, `.ghost-border` (15% grey), `bg-surface-container-lowest`, no shadow | Medium |
| A8 | **Shadows** | `shadow-sm` is the default; `shadow-lg`/`xl` on overlays; `glow` tokens | Almost none | Small |
| A9 | **Icons** | Feather icons via `react-icons/fi` (thin stroke, 1.5px look) | Google **Material Symbols** font (43 uses) | Medium, needs a dependency decision (see Q2) |
| A10 | **Header / nav** | Translucent `bg-white/80 backdrop-blur-xl`, `border-slate-200`. Active item is a rounded pill with an `electric-500→600` gradient and white text | Solid `#FAF8FF`, `border-black/15`, giant centred `TEMPO` in `font-black uppercase`, active link is a black underline | Medium |
| A11 | **Badges / chips** | `rounded-full px-2.5 py-0.5 bg-gray-50 text-gray-600 font-medium` | Square uppercase micro-labels | Small |
| A12 | **Motion** | framer-motion; tokens `--timing-fast/base/slow` (150/250/400 ms), `fadeIn`/`slideUp`/`scaleIn`; respects `prefers-reduced-motion` | framer-motion with its own ad-hoc durations; **no reduced-motion handling** | Small |
| A13 | **Footer** | (no footer in app; use the app's neutral tone) | `text-[10px] uppercase tracking-widest` everywhere | Covered by A5 |
| A14 | **Dark mode** | App is light-only | `darkMode: 'class'` set, `<html class="light">`, nothing actually themed | Leave as is |

**Already consistent:** both use Tailwind 3, framer-motion, a greyscale (no brand colour) identity, and the same TEMPO logo PNG.

---

## 2. Approach

Copy the app's design tokens into the landing page instead of importing them from `../tailwind.config.js`. The landing CI (`.github/workflows/landing.yml`) only triggers on `landing/**`, so a cross-folder import would let app token changes silently skip a landing redeploy. A copy is explicit and keeps `landing/` self-contained. Add a comment at the top of the copied block naming the app file it mirrors.

Do it in phases so each one can be checked visually on its own (`cd landing && npm run dev`).

### Phase 1: foundation (tokens, font, base CSS)
1. `landing/index.html`: replace the Inter link with the app's DM Sans + JetBrains Mono preload (copy from the root `index.html`, lines 7–11).
2. `landing/tailwind.config.js`:
   - Delete the `borderRadius` override (gives back Tailwind's default radii).
   - Add the app's `fontFamily` (`sans`, `mono`), `colors.electric/solar/wind`, `animation`, `boxShadow.glow*`.
   - Replace the Material-3 colour tokens. To keep the diff small, **remap** the names still in use to app values first (e.g. `background`/`surface` → `#f8fafc`, `surface-container*` → slate-100/200, `secondary` → slate-600, `on-surface`/`foreground` → slate-900, `primary` → gray-900), and delete the unused ones. In Phase 3, swap remaining usages to the plain `slate-*`/`gray-*` classes the app uses.
   - Remove `font-headline/body/label/inter` once nothing uses them.
3. `landing/src/index.css`: copy the app's `:root` tokens, `*` font smoothing, `body` (slate-50 + mesh), the `h1–h6` rules, `@keyframes`, the `@layer components` block (`btn-primary`, `btn-secondary`, `card-refined`) and the `prefers-reduced-motion` block. Drop `.ghost-border`/`.technical-frost` once unused.

→ **verify:** `npm run build` passes; every page renders with DM Sans and rounded corners; no blue tint left on backgrounds.

### Phase 2: shared primitives
4. Add `landing/src/components/ui/Button.jsx`, `Card.jsx`, `Badge.jsx` copied from the app's `src/components/ui/` (strip `dark:` variants the landing does not need).
5. Replace the download buttons in `HeroSection.jsx` and the CTA buttons in `Home.jsx`/`Features.jsx` with `Button` (primary = app primary, secondary = `outline`).
6. Replace the "what's new" / feature / workflow tiles with `Card` styling (`rounded-2xl border-gray-200 shadow-sm`, hover lift like `card-refined`).

→ **verify:** buttons and cards look like the app's Dashboard panels side by side (screenshot comparison).

### Phase 3: type voice, page by page
7. Header (`Header.jsx`): translucent `bg-white/80 backdrop-blur-xl border-slate-200`; wordmark in `font-semibold tracking-tight` sentence case next to the logo (like the Sidebar `TitleSection`); nav links `text-sm font-medium text-slate-600 hover:text-slate-900`; active link as the app's rounded pill.
8. Remove most `uppercase` / `font-black` / `tracking-widest`. Rule to apply: **keep uppercase only where the app uses it**: small eyebrow/KPI labels (`text-[10px]` or `text-xs`, `uppercase tracking-wide font-medium text-slate-500`). Headings become `font-semibold tracking-tight`, body text `text-slate-600`.
9. Collapse the many arbitrary sizes (`text-[0.6875rem]`, `text-[0.8125rem]`, `text-[11px]`, …) to the Tailwind scale (`text-xs`, `text-sm`, `text-base`).
10. Do the pages in this order (largest first): `Home.jsx` (813 lines) → `Features.jsx` → `Docs.jsx` → `ApiRef.jsx` → `Footer.jsx` → `CookieConsent.jsx` → legal pages (`Privacy`, `Impressum`, `License`, `CodeOfConduct`).

→ **verify:** `grep -c uppercase` drops from 168 to only eyebrow labels; `font-black` count is 0.

### Phase 4: icons and decoration
11. Icons, depending on Q2: switch Material Symbols to `react-icons/fi` (add the dependency, map each of the ~43 icon names), then remove the Material Symbols `<link>` and the `.material-symbols-outlined` CSS.
12. Background: replace `.grid-bg` with the app's mesh gradient. Decide on `DottedSurface` / `ShadowOverlay` (Q3).
13. Hero screenshots/images: `rounded-xl border border-slate-200 shadow-lg` to match how the app frames maps and charts.

→ **verify:** no Material Symbols request in the network tab; Lighthouse performance not worse than before (one less font).

### Phase 5: check
14. Put the app (`npm run dev`) and landing (`cd landing && npm run dev`) side by side and compare: header vs sidebar, buttons, cards, a KPI/badge, and headings.
15. Check mobile width (375 px) and that `prefers-reduced-motion` stops the hero animations.
16. `npm run build` in `landing/`. Ricardo commits; the landing CI deploys on push.

---

## 3. Open questions (need Ricardo's call before starting)

- **Q1. How literal?** (a) Full match: rounded, sentence case, app buttons/cards everywhere; or (b) shared tokens (font, palette, radius, buttons) but keep some marketing boldness in the hero headline (larger `font-bold` title). Recommendation: (b). A landing page can have one big headline the app does not, as long as font, colours, corners and components match.
- **Q2. Icons:** move to Feather (`react-icons/fi`, same as the app, +1 dependency) or keep Material Symbols? Recommendation: Feather, since the icons are the most visible "this is the same product" signal.
- **Q3. Three.js `DottedSurface` and `ShadowOverlay`:** keep as hero decoration (recoloured to slate), or drop them? Dropping removes the `three` dependency (~600 KB) and matches the app's quieter look. Recommendation: drop, unless they are central to the page's identity for you.
- **Q4. Screenshots:** several images in `landing/src/public/img/` (e.g. `Dashboard.png`, `Results.png`) may show an older app UI. Should they be re-captured from the current app as part of this work?

## 4. Out of scope
- Any change to the app's styles.
- Content/copy rewrites (only casing and size change, not wording).
- Dark mode.
