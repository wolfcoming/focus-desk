# Round 2 — Status bar / back / detail pages / buttons

- Device: Mi 10 (`8b9f5916`)
- Status: `fixed`

## Requests
1. Status bar color must match page color
2. Prototype buttons look ugly
3. System back on sub-pages should return previous page, not exit app
4. Detail pages should open as dedicated pages

## Changes
1. Status/nav/window + Android shell top wash unified to `--surface` `#f4f8fb`
2. Soften primary / plate / empty-slot `+` chips (accent-soft pills, not slate blocks)
3. Disable Wry `handleBackNavigation`; claim Android back with `onBackButtonPress` → React page stack (`popStack`); root calls `plugin:app|exit`
4. Todo / project / sub / settings are dedicated stack frames; tabs hide while nested; float back uses same `popStack`
