# Round 1 �?更多

- Device: Mi 10 (`8b9f5916`)
- Screenshot: `screenshots/r1-more.png`
- Status: `fixed`

## Verdict
只有一项时大标�?+ 大空白会显得空，像未填完的设置壳�?

## Findings
1. **P1 空白过多**：仅「设置」一项时，首屏下半完全空�?
2. **P2 列表�?*：卡片和 chevron 方向正确�?

## Required changes
- 缩小「更多」标题层级；列表上移�?
- 可考虑后续把常用设置快捷入口直接放这里，但本轮先收紧空白�?
