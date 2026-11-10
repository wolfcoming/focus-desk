# Round 1 �?设置

- Device: Mi 10 (`8b9f5916`)
- Screenshot: `screenshots/r1-settings.png`
- Status: `fixed`

## Verdict
卡片分组对，但按钮折行杂乱；说明过长；模型接口地址在手机上过重�?

## Findings
1. **P0 操作按钮折行**：保�?检�?检查提醒挤成不规则换行，不像手机设置页�?
2. **P1 说明文案过长**：顶�?lead 占太多�?
3. **P1 模型接口地址**：同步服务器已隐藏；模型 API URL 仍完整暴露，手机端可降权/折叠�?
4. **P2 悬浮返回**：可用，注意与标题间距�?

## Required changes
- 设置操作改为纵向全宽按钮栈�?
- 缩短手机�?lead�?
- 手机端默认折叠「接口地址」，高级项点开再改�?


## Implementation notes
- API URL hidden behind advanced toggle on Android
- Actions stacked full-width
- Lead shortened

