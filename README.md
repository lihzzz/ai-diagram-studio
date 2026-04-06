# AI Diagram Studio (v2.1)

根据 `AI_DIAGRAM_STUDIO_PROJECT_PLAN_V2.md` 实现的单机版工程骨架，包含：

- `apps/server`: Fastify + Prisma + SQLite API/Worker
- `apps/web`: React + TypeScript + Zustand 前端
- `packages/shared`: 前后端共享 schema/type

## 已落地范围

- 图表 CRUD、版本管理、恢复
- AI 任务接口（text/image/document/chat）+ 状态机（pending/running/succeeded/failed）
- 图生图/文档生图/对话改图入口与 mock 流水线
- 快照与 ChangeSet、diff 查询、回滚
- 资产上传与文档分块解析
- 模板/图标库、模型配置切换、默认模型设置
- 导出（同步和异步 job）
- 前端页面：图表列表、编辑器、AI 面板、差异侧栏、模板图标面板、模型设置、推理摘要
- 单元测试样例（Diff 与 mock 生成）
- `ui-ux-pro-max` 设计产物记录：`docs/UI_UX_DESIGN_SYSTEM.md`

### 模型配置说明

- 不再内置任何默认模型，必须先在前端「模型设置」中新增自定义模型。
- 支持配置 `provider/model/apiBase/apiKey/qualityRank`。
- 自定义模型按标准 OpenAI 协议接入：`Authorization: Bearer <apiKey>`，默认探测 `/v1/models`，必要时降级探测 `/v1/chat/completions`。
- 支持对每个模型执行「测试」：返回可用性、HTTP 状态、延迟。

## 快速启动

```bash
cd /Users/lh/code/ai-diagram-studio
npm install
cp apps/server/.env.example apps/server/.env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

- Server 默认端口：`3000`
- Web 默认端口：`5173`

## 目录

```text
ai-diagram-studio/
  apps/
    server/
    web/
  packages/
    shared/
  docs/
    UI_UX_DESIGN_SYSTEM.md
```
