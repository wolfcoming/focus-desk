# Round 1 �?待办

- Device: Mi 10 (`8b9f5916`)
- Screenshot: `screenshots/r1-todos.png`
- Status: `fixed`

## Verdict
比桌面直搬好一些，但输入区仍偏「表单工具条」，列表操作密度不够手机化�?

## Findings
1. **P0 输入区工具条拥挤**：截�?提醒芯片与「挂靠」同行时易换行难看，仍像桌面工具栏�?
2. **P0 列表操作**：`关联` / `丢掉` 需要足够触控面积，并贴近内容层级，不要像桌面弱链接�?
3. **P1 标题�?*：大标题可保留，副文案保持短句�?
4. **P1 列表卡片**：卡片方向对，行内信息层级（标题 / meta / 操作）还需更紧�?

## Required changes
- 输入卡：主输�?+ 添加；日程图标单独一行；挂靠单独一行入口�?
- 列表项：标题主导，操作改成右侧或底下一�?pill，最小触控高�?40px�?
- 保持挂靠底部面板，不回退到双下拉�?


## Implementation notes
- Compose meta stacked; affil as full-width entry
- List action pills enlarged

