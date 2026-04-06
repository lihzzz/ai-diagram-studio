# Implementation Status (v2.1)

## FR 覆盖

- FR-001~FR-007: 已实现主链路（CRUD/保存/版本/导出/文本生成）
- FR-008 图生图复刻: 已实现上传、解析、生成、低置信度标记（mock）
- FR-009 文档生图: 已实现上传、分块预览、文档生成（mock）
- FR-010 对话式增量改图: 已实现 session/turn/job + ChangeSet 预览应用流程
- FR-011 快照与差异: 已实现 before/after revision + change set + 回滚
- FR-012 模板与图标库: 已实现模板查询/应用、图标查询/上传
- FR-013 Provider 切换: 已实现 model profile CRUD、默认模型切换、任务级绑定
  - 已移除内置 `openai/gpt-4.1`、`anthropic/claude-3-7-sonnet-20250219`，仅保留自定义模型
  - 支持自定义模型 `apiKey` 配置，列表仅返回脱敏预览（不回传明文）
  - 支持模型连接测试（调用 provider `/models` 接口，返回可用性/HTTP 状态/延迟）
- FR-014 推理摘要: 已实现结构化 summary 返回与前端展示/复制/追问入口

## 当前限制

- AI、OCR、文档解析为本地 mock 适配层，需替换为真实 provider/OCR/parser。
- 画布组件为 Excalidraw 占位实现，后续可替换为真实 Excalidraw 元素编辑器。
- 导出 PNG/PDF 当前为结构化文件输出，SVG 为简版导出。
