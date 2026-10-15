# SteadyPost Frontend — Design System (v2)

Warm-paper editorial enterprise theme, modelled on the Practical Roof EMS
template. Every screen is built from the tokens and components below —
**do not invent one-off colours or ad-hoc buttons**. If a new screen needs
something that isn't here, add it to `components/ui/` so the next card
reuses it.

## Design language

- **Calm, refined, spacious.** Warm paper `#f7f6f3` page, white cards, forest
  green `#2c5f4a` brand — never flat gray, never gradients on CTAs.
- **Three typefaces, three jobs:** `font-serif` (Instrument Serif) for display
  and page titles; `font-sans` (DM Sans) for UI and body; `font-mono`
  (DM Mono, uppercase) for labels, tags, KPI numerals, and metadata.
- **Restrained micro-motion:** 150–220ms `cubic-bezier(0.4,0,0.2,1)`,
  hover lifts (`-translate-y-px`), staggered fade-up entrances on grids
  (`.stagger`). Nothing garish.
- **Theme is light-only** (the template has no dark mode). `ThemeProvider`
  was removed in v2.

## Tokens

`tailwind.config.js` + `app/globals.css` are the single source of truth.

- **Surfaces:** `bg-canvas` (page `#f7f6f3`), `bg-surface` (nav/sidebar), `bg-card` (cards/panels), `bg-card-muted` (`#faf9f7`)
- **Text:** `text-ink` (`#1a1816`, 16.4:1), `text-ink-2` (`#6b6560`, 5.3:1), `text-ink-3` (`#766f69`, 4.9:1 on white)
- **Borders:** `border-line` (`#e2dfda`), `border-line-subtle` (`#ece9e4`), `border-line-strong`
- **Brand:** forest green scale `brand-500` (`#2c5f4a`) → `brand-700` (`#234d3b`); tint `brand-50` (`#e8f0ec`). Primary CTA = `.btn-brand` (solid, white text, hover lifts).
- **AI accent:** deep plum `ai-500` (`#6b4c8a`), tint `ai-100` (`#f3eef8`)
- **Status:** `success / warning / danger / info / accent` + `-bg` tints, all ≥4.5:1 on their bg (verified in `app/globals.css`)
- **Type scale:** `text-display` (58px serif), `text-h1` (33px serif), `text-h2` (24px serif), `text-h3`, `text-body`, `text-body-sm`, `text-caption`, `text-micro`, `text-label` (10px mono uppercase)
- **Elevation:** warm-tinted `shadow-1/2/3`, `shadow-modal`, `shadow-lift` — never neutral gray
- **Radius:** `rounded-md` (10px) inputs/buttons, `rounded-lg` (14px) cards, `rounded-xl` (20px) modals

> Rule: never use raw `slate-*`/`zinc-*`/`gray-*` classes for chrome.
> Use the tokens.

## Components (`components/ui/`)

```jsx
import { Button, IconButton } from "./ui/Button";
import { Field, Input, Textarea, Select } from "./ui/Field";
import { Modal, ModalHeader, Drawer } from "./ui/Modal";
import { Card, CardHeader, CardBody, PageHeader, StatCard } from "./ui/Card";
import { Tabs, TabPanel } from "./ui/Tabs";
import { Badge, StatusChip } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { Skeleton, CardGridSkeleton } from "./ui/Skeleton";
import { ToastContainer } from "./ui/Toast"; // already mounted in app/layout.jsx
```

| Component | Usage |
|---|---|
| `Button` | `variant`: `primary` (default, solid forest `.btn-brand`), `secondary`, `ghost`, `danger`, `ai` (plum). `size`: `sm`, `md`, `lg`. `loading` shows a spinner. |
| `IconButton` | Icon-only actions. **`label` is required** — it becomes the `aria-label`. |
| `Field` + `Input`/`Textarea`/`Select` | Paper-tinted bg, radius 10; focus → white bg + 3px `brand-50` ring. `Field` wires `label` (mono uppercase), `hint`, `error` (`role="alert"`) automatically. |
| `Modal` | Focus-trapped, ESC + scrim click close, returns focus. Radius 20, warm modal shadow. `ModalHeader` takes `id` for `aria-labelledby`. |
| `Drawer` | Right-side panel, same a11y contract as `Modal`. |
| `Card`, `CardHeader`, `CardBody` | Standard panel; `hover` prop adds the template lift. `CardHeader` takes `eyebrow` (mono) + serif `title`. `PageHeader` = eyebrow + serif title + description + actions. `StatCard` = KPI with 34px tinted icon tile + 26px mono numeral + trend chip. |
| `Tabs` | Segmented control; active tab is a white card. Roving-tabindex, arrow-key navigation. |
| `Badge`, `StatusChip` | DM Mono uppercase tinted chips (template badge language). `StatusChip` maps lifecycle statuses to tones. |
| `EmptyState` | Serif title, mono eyebrow, **one primary action**. |
| `Skeleton`, `CardGridSkeleton` | Loading placeholders (shimmer, `role="status"`). |
| `Toast` | Via the store: `addToast("success" \| "error" \| "info", text)`. |

## Feed previews (`components/feed/`)

```jsx
import { getFeedPreview, registerFeedPreview } from "./feed";

// Render the preview for a channel:
const { Component } = getFeedPreview("instagram");
<Component accountName body mediaUrls mediaIndex onMediaIndexChange />
```

New channels (e.g. GBP, card #13) register with `registerFeedPreview("gbp",
{ label: "Google Business", Component: GbpPreview })` — the studio and
calendar pick them up with no other changes. Action icons are real SVGs in
`components/Icons.jsx` (no emoji).

## App shell

- `components/Topbar.jsx` — brand lockup (forest mark + wordmark + mono sub-label), workspace switcher, channel status pill, AI Studio, New Post, user chip.
- `components/Sidebar.jsx` — white 256px desktop sidebar + mobile drawer + `MobileTabBar`. Nav grouped under mono section labels; active item = `brand-50` pill + 3px forest indicator bar. Footer: AI status card + user card with logout.
- `components/WorkspaceSwitcher.jsx` — card #02 (multi-venture) plugs real data into the existing `workspaces` store slice.

## Conventions

- Mobile-first: design at 375px, enhance with `sm:`/`md:`/`lg:`. No horizontal scroll.
- Keyboard: every action reachable, `:focus-visible` forest ring is global — don't remove it.
- New icons go in `components/Icons.jsx` (24px stroke icons, `aria-hidden` inside; the button supplies the label).
- `lib/cn.js` — `cn()` classnames helper (wraps `clsx`).
