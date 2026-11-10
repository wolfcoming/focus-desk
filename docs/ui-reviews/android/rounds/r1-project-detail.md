# Round 1 �?项目详情

- Device: Mi 10 (`8b9f5916`)
- Screenshot: `screenshots/r1-project-detail.png`
- Status: `fixed`

## Verdict
信息都在，但危险操作、状态芯片、删除图标的位置像桌面详情页缩排，不像手机项目页�?

## Findings
1. **P0 删除项目位置危险**：紧挨大标题，视觉权重接近描述文字，易误触且层级混乱�?
2. **P0 子任务行**：状�?chip + 删除图标排布松散，删除不像手机常见的次级操作�?
3. **P1 元信息条**：建立时�?计数挤在一起，可读性一般�?
4. **P1 分区卡片**：子任务/待办/阻塞已有卡片感，可继续统一内边距�?

## Required changes
- 删除项目移到更安全位置（更多菜单或页面底部危险区），至少远离标题主路径�?
- 子任务行改为：标�?+ 状态摘要；删除收入更明确的次级操作�?
- 元信息改为更紧的移动端事实行�?


## Implementation notes
- Delete project moved to bottom danger zone on Android

