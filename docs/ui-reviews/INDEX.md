# Android UI Reviews

Scope: Android only (`com.focusdesk.app`).
Device: Mi 10 (`umi` / `8b9f5916`).
Rule: ADB taps/input/screenshots stay inside this app.

## Screens

| ID | Screen | Status | Latest round | Verify shot |
|---|---|---|---|---|
| today | 今天 | fixed | [r1-today](android/rounds/r1-today.md) | `r2-today.png` |
| todos | 待办 | fixed | [r1-todos](android/rounds/r1-todos.md) | `r2-todos.png` |
| projects | 项目列表 | fixed | [r1-projects](android/rounds/r1-projects.md) | `r2-projects.png` |
| project-detail | 项目详情 | fixed | [r1-project-detail](android/rounds/r1-project-detail.md) | `r2-project-detail.png` |
| more | 更多 | fixed | [r1-more](android/rounds/r1-more.md) | `r2-more.png` |
| settings | 设置 | fixed | [r1-settings](android/rounds/r1-settings.md) | `r2-settings.png` |
| today-picker | 今日三件选择面板 | fixed | [r1-today-picker](android/rounds/r1-today-picker.md) | `r2-today-picker.png` |

## Rounds

- Round 1 reviews: `android/rounds/r1-*.md` + screenshots `r1-*.png`
- Round 1 implementation applied; verification screenshots `r2-*.png`
- Next: user acceptance → mark `pass`, or open Round 2 for remaining polish

## Status legend

- `pending` — not reviewed yet
- `needs-fix` — review recorded, waiting for implementation
- `fixed` — changes applied for latest round
- `pass` — re-review accepted

## Round 2 addendum
- [r2-status-back-detail](android/rounds/r2-status-back-detail.md): status bar color, button polish, system back stack, dedicated detail pages
