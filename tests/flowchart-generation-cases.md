# Flowchart Generation Regression Cases

## 1. Scope

- Target: flowchart generation path (`text -> job -> preview -> apply -> render`)
- Goal: verify generation stability, layout correctness, style template effect, and error fallback behavior
- Out of scope: module architecture deep validation, export rendering visual QA

## 2. Environment Preconditions

- Web app and server both running
- At least one available model profile configured as default
- Open one existing diagram in editor page
- If testing template cases, prepare one valid style JSON template and one invalid JSON

## 3. Pass/Fail General Rules

- Pass: result matches expected behaviors and no blocking error popup/log crash
- Fail: blank canvas, immediate disappearance, wrong branch/link semantics, unrecoverable errors, or state corruption

## 4. Test Cases

### FC-01 Basic Sequential Flow

- Input: `用户注册 -> 邮箱验证 -> 登录`
- Steps:
  1. Open AI panel
  2. Select `流程图`
  3. Submit input
- Expected:
  - >= 3 non-arrow nodes
  - edges connect in sequence
  - preview appears then persists after apply

### FC-02 Single Sentence Intent Expansion

- Input: `帮我画一个电商下单流程图`
- Expected:
  - system expands into practical multi-step flow
  - not single-node output
  - includes start/end-like semantic steps

### FC-03 Branch/Decision Scenario

- Input: `订单支付后判断是否成功，失败则重试，成功则发货`
- Expected:
  - contains decision node semantics
  - has at least two outgoing branches from decision area
  - branch intent is readable from labels/text

### FC-04 Mixed Language Input

- Input: `Create an onboarding flow: signup, verify, first login`
- Expected:
  - generation succeeds without encoding issues
  - english labels readable
  - structural order remains logical

### FC-05 Long Paragraph Input

- Input: long requirement paragraph (~800-1200 Chinese chars)
- Expected:
  - generation completes within acceptable time
  - output is not empty
  - node count is reasonable (not collapsed to 1-2, not exploding to unreadable extreme)

### FC-06 Special Characters

- Input: `A/B测试 -> 指标统计 -> 结论#1`
- Expected:
  - no JSON parse/server schema error
  - labels display correctly
  - edges remain valid

### FC-07 Empty Input Guard

- Input: empty or spaces
- Expected:
  - submit blocked in UI or explicit validation error shown
  - no generation job should be created

### FC-08 Very Short Input

- Input: `支付流程`
- Expected:
  - non-empty practical flow returned
  - no failure due to short prompt

### FC-09 Incremental Optimization

- Pre-step: generate any base flow first
- Input: `新增退款分支并连接到订单服务`
- Expected:
  - unrelated existing structure preserved
  - requested delta added correctly
  - no full reset to unrelated diagram

### FC-10 Rapid Re-Submit

- Steps:
  1. input valid text
  2. click generate rapidly multiple times
- Expected:
  - final state stable
  - no "flash then disappear" behavior
  - no stuck pending UI

### FC-11 Preview to Applied Consistency

- Input: any valid medium complexity flow
- Expected:
  - preview content and applied content materially consistent
  - after apply, canvas does not revert to empty/old state unexpectedly

### FC-12 Style Template Applied

- Pre-step: select a valid style template (JSON imported)
- Input: `生成一个用户下单到发货流程`
- Expected:
  - canvas colors/border/edge style reflect template renderConfig
  - generation still structurally valid

### FC-13 Invalid Style Template JSON

- Template payload missing `renderConfig`
- Expected:
  - clear error message in template upload area
  - invalid template not persisted
  - existing templates unaffected

### FC-14 Model Unavailable Fallback/Error

- Pre-step: disable/remove default model key or force unreachable model
- Input: any valid flow request
- Expected:
  - job fails with explicit error
  - existing canvas content remains intact
  - no silent data loss

### FC-15 Undo Generation

- Steps:
  1. generate and apply a new result
  2. click `撤销生成`
- Expected:
  - restores previous elements snapshot
  - reasoning summary rolls back accordingly
  - no partial corruption

## 5. Optional API-Level Checks (High Signal)

For FC-11 / FC-15, use devtools network or API client to verify:

- `POST /api/generation-jobs` created successfully
- `GET /api/generation-jobs/:jobId` eventually returns `succeeded`
- `POST /api/generation-jobs/:jobId/apply` returns success
- `GET /api/diagrams/:id` elements match expected applied state

## 6. Regression Record Template

| Date | Build/Commit | Case ID | Result | Notes | Owner |
|---|---|---|---|---|---|
| YYYY-MM-DD |  | FC-01 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-02 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-03 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-04 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-05 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-06 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-07 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-08 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-09 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-10 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-11 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-12 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-13 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-14 | Pass/Fail |  |  |
| YYYY-MM-DD |  | FC-15 | Pass/Fail |  |  |
