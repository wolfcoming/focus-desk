---
name: Little Fun
description: Cool light table for today’s three illuminated focus plates—never a cream journal or metric dashboard.
colors:
  ink: "#2A3640"
  ink-soft: "#5B6B76"
  ink-faint: "#7A8B96"
  shell: "#D7E4EC"
  shell-deep: "#C5D6E1"
  surface: "#F4F8FB"
  surface-bright: "#FFFFFF"
  surface-recessed: "#E8F0F5"
  line: "#C9D8E2"
  line-soft: "#D9E5ED"
  accent: "#5B7C8A"
  accent-deep: "#3F5F6C"
  accent-soft: "#DCE8EE"
  on-accent: "#F7FBFD"
  amber: "#B45309"
  danger: "#9B3B2A"
  selection: "#C5D9E4"
  glow: "rgba(255, 255, 255, 0.72)"
  glow-strong: "rgba(255, 255, 255, 0.92)"
typography:
  display:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "\"Avenir Next\", \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Noto Sans SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  checkbox: "3px"
  sm: "8px"
  md: "10px"
  modal: "12px"
  plate: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  "2xl": "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  button-default:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  input:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 8px"
  plate:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "14px 14px 12px"
  plate-lit:
    backgroundColor: "{colors.surface-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "14px 14px 12px"
  plate-empty:
    backgroundColor: "{colors.surface-recessed}"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.plate}"
    padding: "14px 14px 12px"
  nav-active:
    backgroundColor: "rgba(255, 255, 255, 0.72)"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  status-chip:
    backgroundColor: "rgba(255, 255, 255, 0.55)"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  add-row:
    backgroundColor: "transparent"
    textColor: "{colors.accent-deep}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
---

# Design System: Little Fun

## Overview

**Creative North Star: "The Cool Light Table"**

Little Fun is a photographer’s light table for today’s work: a mist-blue shell holds place, a luminous cool field holds attention, and at most three frosted plates carry focus. Illumination marks what is in progress; empty plates read as unused slots on the glass, not empty cards on a dashboard. The denseness is soft frosted-plane material—translucent whites, cool recessed fills, thin metal-edge dividers—never cream paper, never metric tiles.

The UI type is a workhorse geometric stack (Avenir Next / Segoe UI) with CJK system fallbacks so Chinese product vocabulary stays crisp beside Latin UI chrome. Motion is brief and physical: plates settle into light, hover lifts two pixels, modals rise once. Scrollbars inherit the mist shell so chrome stays in-world.

Confirmed visual rejections: warm cream journals, purple-on-white product chrome, hard offset neobrutalist shadows, and dashboard stat strips as first-viewport furniture.

**Key Characteristics:**
- Mist-blue rail (`#D7E4EC`) beside a luminous cool ground (`#F4F8FB`)
- Three light-table plates as the signature focus device, with under-glow and lit settle
- Graphite ink (`#2A3640`) and slate accent (`#5B7C8A`); amber only for due/attention
- Thin metal-edge dividers; frosted planes instead of heavy card stacks
- Geometric UI type with PingFang / Hiragino / Noto / YaHei CJK fallback

## Colors

Cool mist and luminous ground; slate for action; amber reserved for time pressure.

### Primary
- **Slate Accent** (`#5B7C8A`): Primary actions, progress fills, checked controls, lit plate ring tint. Deepens to **Slate Depth** (`#3F5F6C`) on hover and for quiet accent text. Soft wash **Slate Mist** (`#DCE8EE`) backs active icon buttons and todo chips.

### Secondary
Omit a second brand accent. Amber is attention-only, not a secondary brand voice.

### Tertiary
Omit.

### Neutral
- **Graphite Ink** (`#2A3640`): Primary text and selection foreground.
- **Ink Soft** (`#5B6B76`) / **Ink Faint** (`#7A8B96`): Meta, leads, empty-slot labels, nav group labels.
- **Mist Shell** (`#D7E4EC`) / **Shell Deep** (`#C5D6E1`): Left rail fill and metal-edge rail dividers; scrollbar thumb base.
- **Luminous Surface** (`#F4F8FB`): App field; bright white (`#FFFFFF`) for controls and lit plate tops; recessed (`#E8F0F5`) for empty-plate cool wells and popover hover.
- **Metal Line** (`#C9D8E2`) / **Line Soft** (`#D9E5ED`): Control borders and list hairlines.
- **On-Accent** (`#F7FBFD`): Text on filled accent / danger buttons.
- **Frost Glow** (`rgba(255,255,255,0.72)` / `0.92`): Main-surface top bloom and frosted overlays.
- **Due Amber** (`#B45309`): Due timestamps and attention only.
- **Danger Clay** (`#9B3B2A`): Destructive actions and must-mark text.
- **Selection Mist** (`#C5D9E4`): Text selection wash.

### Named Rules
**The Amber Attention Rule.** Amber (`#B45309`) appears only for due dates and time-pressure cues—never as brand fill, charts, or decorative accent.

**The Illumination Rule.** Brightness and under-glow signal “in progress” on plates; do not invent a second status color language for focus.

## Typography

**Display Font:** Avenir Next (Segoe UI, then PingFang SC / Hiragino Sans GB / Noto Sans SC / Microsoft YaHei, sans-serif)
**Body Font:** Same stack
**Label/Mono Font:** Same stack (no separate mono); tabular nums only where counts need alignment

**Character:** Workhorse geometric UI type—clear, slightly condensed tracking on titles, comfortable for mixed Chinese/English desktop work. No display serif, no editorial italic pairing.

### Hierarchy
- **Display** (650, 30px, ~1.2, −0.03em): Page titles such as 今天.
- **Headline** (700, 19px, −0.02em): Brand wordmark in the rail.
- **Title** (650, 16px, 1.35, −0.015em): Plate titles and list row titles (row h3 at 600).
- **Body** (400, 15px, 1.45): Default UI copy; leads max ~62ch in soft ink.
- **Label** (650, 11px, 0.08em, uppercase): Plate indices and rail nav group labels; section micro-labels sit at 12px without forced uppercase.

### Named Rules
**The One Stack Rule.** All UI shares the geometric + CJK fallback stack; do not introduce a second display family for marketing moments inside the app shell.

## Layout

Shell is a two-column desk: fixed mist rail (232px) + luminous main (padding 28×28×48, max-width 920px). Rail stacks brand, nav groups with hairline dividers, and a quiet WIP footnote. Main opens with title + lead, then the three-plate deck, then tools and the 今天的日常 / 杂事 lists as hairline rows—not card grids.

**Plate deck:** `repeat(3, minmax(0, 1fr))` with gap `clamp(8px, 1.4vw, 14px)`. At ≤1180px plates tighten (gap 8px, min-height 132px, 12px padding). At ≤860px the deck stacks to one column. At ≤800px the app collapses to a single column; rail becomes a top mist band with bottom metal edge.

**Rhythm:** Prefer 4 / 8 / 12 / 16 / 22 / 28px steps. Lists use 12px vertical padding and soft hairlines; forms cap ~520px.

**Scrollbar:** Thin, shell-tinted thumbs (`scrollbar-color: shell-deep transparent`; WebKit thumb mixes shell-deep with 20% accent)—chrome stays mist, not OS-default gray.

## Elevation & Depth

Depth is frosted glass and cool under-glow, not stacked drop shadows. The app field uses a soft radial bloom plus a vertical cool gradient; plates sit on a hairline white inset edge plus diffuse graphite umbra, with a blurred elliptical under-glow beneath each plate.

### Shadow Vocabulary
- **Ambient panel** (`0 10px 28px rgba(42, 54, 64, 0.08)`): Modals and schedule popovers.
- **Plate rest** (`0 1px 0 rgba(255,255,255,0.85) inset, 0 8px 24px rgba(42,54,64,0.08)`): Default occupied plate.
- **Plate hover** (`… inset 0.95, 0 12px 32px rgba(42,54,64,0.12)`): Lifted plate (`translateY(-2px)`).
- **Plate lit:** White inset, 1px slate ring (`rgba(91,124,138,0.22)`), deeper umbra, and cool bloom (`0 0 28px rgba(180,210,225,0.55)`), plus stronger under-glow.
- **Nav active:** Soft inset white + light umbra on frosted chip.
- **Empty plate:** Inset highlight and cool recessed well—no lift on hover.

### Named Rules
**The Under-Glow Rule.** Plate depth comes from the blurred elliptical glow under the plane and the lit bloom when active—not from hard offset shadows.

**The Flat List Rule.** Daily/todo rows are hairline-separated planes on the luminous field; do not wrap them in plate elevation.

## Shapes

Corners stay modest and tool-like: controls at 8px, general surfaces at 10px, modals/popovers at 12px, signature plates at 14px. Pills (999px) are reserved for status chips and schedule chips. Checkboxes are 3px squares with a drawn check—no circular toggles as the default control. Borders are 1px metal lines (`#C9D8E2`) or softer list hairlines; dashed metal edges mark “add” affordances. Plates use near-white frosted borders; empty plates switch to a cooler metal edge.

## Components

### Buttons
- **Shape:** Gently curved (8px).
- **Primary:** Slate fill (`#5B7C8A`), on-accent text (`#F7FBFD`), matching border; hover deepens to `#3F5F6C`.
- **Default:** Bright surface + metal border; hover border shifts to accent.
- **Quiet:** Transparent, no border; hover gains soft white wash and metal border.
- **Danger:** Clay fill (`#9B3B2A`) for destructive confirmations.
- **Focus:** 2px accent outline, 2px offset on buttons and fields.
- **Motion:** Border/background/color ~140ms, shadow ~160ms on `--ease` (`cubic-bezier(0.16, 1, 0.3, 1)`).

### Chips
- **Status chip:** Pill, frosted white wash, metal border, soft ink, 12px type—project state only.
- **Todo chip:** Pill on slate mist wash for schedule tags.
- **Plate index:** Not a chip—uppercase 11px slot label on the plate itself.

### Cards / Containers
- **Signature container is the plate**, not a generic card. Corner 14px; frosted white-to-cool gradient; rest/hover/lit/empty states as in Elevation.
- **Modal / popover:** Bright surface, metal border, 12px radius, ambient shadow; modal rises 160ms.
- **Lists:** No card chrome—hairline rows on the luminous field.
- **Internal plate padding:** 14×14×12 (12px at the mid breakpoint).

### Inputs / Fields
- **Style:** Bright fill, 1px metal border, 8px radius, 7×8 padding; full width in stacks.
- **Focus:** Same accent outline ring as buttons.
- **Checkbox:** 16px square, 1.5px faint-ink border, 3px radius; checked fills accent with on-accent checkmark.
- **Disabled buttons:** 0.55 opacity.

### Navigation
- Mist rail with top frost veil; brand 19px/700; group labels 11px uppercase faint ink; transparent nav buttons; active item frosted white chip with soft shadow. Tree projects indent under the Projects group; dashed add rows use accent-deep text. Thin shell-deep hairlines separate rail groups.

### Light-table plate (signature)
Three plates in `.plate-deck` hold 今日三件. Occupied plates show index, title, meta (amber due when present), and compact actions. **Lit** (in progress) brightens the gradient, rings slate, strengthens under-glow, bumps brightness, and runs `plate-settle` (420ms ease: settle from +4px). **Empty** plates are recessed cool wells labeled 槽位 N / 还空着, no hover lift. Prefer `prefers-reduced-motion: reduce` to kill plate transition and settle animation.

## Do's and Don'ts

### Do:
- **Do** keep the first Today viewport as mist rail + luminous field + three plates, then dailies/todos.
- **Do** use plate lit/empty states and under-glow to show focus—not badges, traffic lights, or KPI tiles.
- **Do** reserve amber strictly for due/attention text.
- **Do** keep metal-edge hairlines and frosted planes as the default separation language.
- **Do** honor plate-deck breakpoints (1180 / 860) and the 800px shell collapse.
- **Do** theme scrollbars to shell mist so OS chrome does not break the light table.

### Don't:
- **Don't** restyle the shell as a cream journal, warm paper, or purple gradient SaaS theme.
- **Don't** turn 今日三件 into a metric dashboard, stat strip, or multi-card masonry.
- **Don't** apply plate elevation to ordinary list rows.
- **Don't** use amber as a general brand or chart color.
- **Don't** replace the geometric + CJK stack with a decorative display serif inside the app.
- **Don't** add hard offset neobrutalist shadows; depth stays soft umbra + under-glow.
