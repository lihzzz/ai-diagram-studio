# AI Diagram Studio 测试用例文档

## 一、单元测试 (Unit Tests)

### 1. Excalidraw 适配器测试

#### TC-ADP-001: 节点到 Excalidraw 元素转换
```
描述: 验证 DiagramElement 节点正确转换为 Excalidraw 格式
输入:
  - 节点: { id: "node1", type: "rectangle", x: 100, y: 200, width: 150, height: 80, text: "测试节点" }
预期输出:
  - Excalidraw 元素包含正确的坐标、尺寸、文本
  - strokeColor 为 "#1f6f66"
  - backgroundColor 为 "#ffffff"
```

#### TC-ADP-002: 箭头边界点计算（水平布局）
```
描述: 验证水平排列节点的箭头从右边界连接到左边界
输入:
  - 节点A: { x: 100, y: 100, width: 150, height: 80 }
  - 节点B: { x: 400, y: 100, width: 150, height: 80 }
  - 箭头: { fromId: "A", toId: "B" }
预期输出:
  - 箭头起点: (250, 140) - 节点A右边界中心
  - 箭头终点: (400, 140) - 节点B左边界中心
```

#### TC-ADP-003: 箭头边界点计算（垂直布局）
```
描述: 验证垂直排列节点的箭头从上下边界连接
输入:
  - 节点A: { x: 100, y: 100, width: 150, height: 80 }
  - 节点B: { x: 100, y: 300, width: 150, height: 80 }
  - 箭头: { fromId: "A", toId: "B" }
预期输出:
  - 箭头起点: (175, 180) - 节点A下边界中心
  - 箭头终点: (175, 300) - 节点B上边界中心
```

#### TC-ADP-004: 复杂图表双向转换一致性
```
describe("excalidraw-adapter round-trip", () => {
  it("应保持元素数量和属性一致", () => {
    const originalElements = [
      { id: "rect1", type: "rectangle", x: 100, y: 100, width: 150, height: 80 },
      { id: "rect2", type: "rectangle", x: 300, y: 100, width: 150, height: 80 },
      { id: "arrow1", type: "arrow", text: "rect1->rect2", meta: { fromId: "rect1", toId: "rect2" }}
    ];

    const excalElements = toExcalidrawElements(originalElements);
    const convertedBack = fromExcalidrawElements(excalElements as any);

    expect(convertedBack).toHaveLength(3);
    expect(convertedBack.filter(e => e.type === "rectangle")).toHaveLength(2);
    expect(convertedBack.filter(e => e.type === "arrow")).toHaveLength(1);
  });
});
```

---

### 2. Diff 算法测试

#### TC-DIFF-001: 节点属性变更检测
```
描述: 验证节点位置或文本变化被正确识别
输入:
  - 旧元素: [{ id: "n1", type: "rectangle", x: 100, y: 100, text: "旧文本" }]
  - 新元素: [{ id: "n1", type: "rectangle", x: 150, y: 100, text: "新文本" }]
预期输出:
  - 检测到 n1.x 从 100 变为 150
  - 检测到 n1.text 从 "旧文本" 变为 "新文本"
  - 变更类型: UPDATE
```

#### TC-DIFF-002: 新增和删除节点检测
```
描述: 验证新增和删除的节点被正确识别
输入:
  - 旧元素: [{ id: "n1", type: "rectangle" }]
  - 新元素: [{ id: "n1", type: "rectangle" }, { id: "n2", type: "diamond" }]
预期输出:
  - 新增: n2 (类型: CREATE)

输入:
  - 旧元素: [{ id: "n1", type: "rectangle" }, { id: "n2", type: "diamond" }]
  - 新元素: [{ id: "n1", type: "rectangle" }]
预期输出:
  - 删除: n2 (类型: DELETE)
```

#### TC-DIFF-003: 箭头连接关系变更
```
描述: 验证箭头连接目标变化被正确检测
输入:
  - 旧元素: [{ id: "a1", type: "arrow", meta: { fromId: "n1", toId: "n2" }}]
  - 新元素: [{ id: "a1", type: "arrow", meta: { fromId: "n1", toId: "n3" }}]
预期输出:
  - 检测到 a1.toId 从 n2 变为 n3
```

---

### 3. Store 测试

#### TC-STORE-001: EditorStore 状态管理
```
describe("editorStore", () => {
  it("setDiagram 应重置所有编辑器状态", () => {
    const store = useEditorStore.getState();
    store.setDiagram({
      id: "d1",
      title: "测试图表",
      elements: [{ id: "e1", type: "rectangle", x: 100, y: 100 }]
    });

    expect(store.currentDiagram?.id).toBe("d1");
    expect(store.elements).toHaveLength(1);
    expect(store.selection).toEqual([]);
    expect(store.dirty).toBe(false);
    expect(store.localHistory).toHaveLength(1);
  });

  it("setElements 应标记 dirty 状态", () => {
    const store = useEditorStore.getState();
    store.setElements([{ id: "e2", type: "rectangle", x: 200, y: 200 }]);

    expect(store.dirty).toBe(true);
  });

  it("undoLocal 应恢复到上一版本", () => {
    const store = useEditorStore.getState();
    const initialElements = store.elements;

    store.pushHistory();
    store.setElements([...initialElements, { id: "new", type: "diamond" }]);
    store.pushHistory();

    store.undoLocal();

    expect(store.elements).toEqual(initialElements);
  });
});
```

#### TC-STORE-002: JobStore 任务状态流转
```
describe("jobStore", () => {
  it("任务状态机应正确流转", () => {
    const store = useJobStore.getState();

    // 初始状态
    expect(store.status).toBe("idle");
    expect(store.activeJobId).toBeNull();

    // 开始任务
    store.setRunning("job-123");
    expect(store.status).toBe("pending");
    expect(store.activeJobId).toBe("job-123");

    // 任务完成
    store.setResult({
      status: "succeeded",
      progress: 100,
      previewElements: [{ id: "p1", type: "rectangle" }],
      reasoningSummary: { summary: "测试" },
      error: null
    });
    expect(store.status).toBe("succeeded");
    expect(store.previewElements).toHaveLength(1);

    // 重置
    store.reset();
    expect(store.status).toBe("idle");
  });
});
```

---

## 二、集成测试 (Integration Tests)

### 1. API 集成测试

#### TC-API-001: 图表 CRUD 流程
```
describe("Diagram API", () => {
  it("应支持完整的图表生命周期", async () => {
    // 创建
    const created = await api.createDiagram({
      title: "测试流程图",
      type: "flowchart"
    });
    expect(created.id).toBeDefined();
    expect(created.elements).toEqual([]);

    // 读取
    const fetched = await api.getDiagram(created.id);
    expect(fetched.title).toBe("测试流程图");

    // 更新
    const updated = await api.saveDiagram(created.id, {
      title: "更新后的标题",
      elements: [{ id: "node1", type: "rectangle", x: 100, y: 100 }]
    });
    expect(updated.title).toBe("更新后的标题");
    expect(updated.elements).toHaveLength(1);

    // 列表查询
    const list = await api.listDiagrams();
    expect(list.some(d => d.id === created.id)).toBe(true);

    // 删除
    await api.deleteDiagram(created.id);
    const afterDelete = await api.listDiagrams();
    expect(afterDelete.some(d => d.id === created.id)).toBe(false);
  });
});
```

#### TC-API-002: AI 生成任务流程
```
describe("Generation Job API", () => {
  it("应创建并跟踪生成任务", async () => {
    // 创建任务
    const { jobId } = await api.createGenerationJob({
      mode: "text",
      diagramType: "flowchart",
      inputText: "用户注册流程"
    });
    expect(jobId).toBeDefined();

    // 轮询任务状态
    let attempts = 0;
    let result;
    while (attempts < 10) {
      result = await api.getGenerationJob(jobId);
      if (result.status === "succeeded" || result.status === "failed") {
        break;
      }
      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }

    expect(result.status).not.toBe("pending");
    if (result.status === "succeeded") {
      expect(result.result).toBeDefined();
      expect(Array.isArray(result.result)).toBe(true);
    }
  });
});
```

---

### 2. 组件集成测试

#### TC-COMP-001: DiagramCanvas 数据同步
```
describe("DiagramCanvas", () => {
  it("应正确同步外部 elements 变化到画布", async () => {
    const onElementsChange = jest.fn();
    const onSelect = jest.fn();

    const { rerender } = render(
      <DiagramCanvas
        elements={[]}
        selection={[]}
        onSelect={onSelect}
        onElementsChange={onElementsChange}
      />
    );

    // 模拟外部数据更新
    const newElements = [
      { id: "rect1", type: "rectangle", x: 100, y: 100, width: 150, height: 80 }
    ];

    rerender(
      <DiagramCanvas
        elements={newElements}
        selection={[]}
        onSelect={onSelect}
        onElementsChange={onElementsChange}
      />
    );

    // 验证画布更新了元素
    await waitFor(() => {
      expect(screen.getByTestId("excalidraw-canvas")).toBeInTheDocument();
    });
  });

  it("保存后重新打开应保持内容", async () => {
    // 模拟保存流程
    const store = useEditorStore.getState();
    store.setDiagram({ id: "d1", title: "测试", elements: [] });
    store.setElements([{ id: "e1", type: "rectangle", x: 100, y: 100 }]);

    // 模拟返回列表再打开
    store.setDiagram({ id: "d1", title: "测试", elements: store.elements });

    // 验证元素仍然存在
    expect(store.elements).toHaveLength(1);
  });
});
```

#### TC-COMP-002: EditorPage 状态协调
```
describe("EditorPage", () => {
  it("AI生成预览应正确显示", async () => {
    render(<EditorPage onBack={jest.fn()} onDiagramUpdate={jest.fn()} />);

    // 触发 AI 生成
    const aiPanel = screen.getByTestId("ai-panel");
    fireEvent.click(aiPanel);

    // 等待生成完成
    await waitFor(() => {
      expect(screen.getByText("应用预览")).toBeEnabled();
    });

    // 应用预览
    fireEvent.click(screen.getByText("应用预览"));

    // 验证图表已更新
    await waitFor(() => {
      expect(screen.getByTestId("canvas")).toBeInTheDocument();
    });
  });
});
```

---

## 三、E2E 测试 (End-to-End Tests)

### 1. 用户工作流测试

#### TC-E2E-001: 完整绘图流程
```
Test Case: 创建并保存流程图

Precondition:
  - 服务已启动
  - 数据库已初始化

Steps:
  1. 访问首页 http://localhost:5173
  2. 点击"新建图表"
  3. 输入标题"订单流程"
  4. 选择类型"flowchart"
  5. 在画布上绘制:
     - 创建矩形节点"创建订单"
     - 创建菱形节点"支付成功？"
     - 创建矩形节点"发货"
     - 创建矩形节点"取消订单"
     - 用箭头连接各节点
  6. 点击"保存"按钮
  7. 等待保存成功提示
  8. 点击"返回"回到列表
  9. 点击刚才创建的"订单流程"图表

Expected Results:
  - 步骤9后，画布应显示完整的流程图
  - 包含所有节点和箭头
  - 节点文本正确显示
  - 箭头连接关系正确

Verification Points:
  ✓ 保存后返回，重新打开内容不丢失
  ✓ 节点位置、大小保持一致
  ✓ 箭头连接点位于节点边界而非中心
```

#### TC-E2E-002: AI 生成图表流程
```
Test Case: 使用 AI 生成流程图

Precondition:
  - 已配置 AI 模型

Steps:
  1. 访问编辑器页面
  2. 在 AI 面板输入"电商订单处理流程"
  3. 点击"生成"按钮
  4. 等待生成完成
  5. 查看预览效果
  6. 点击"应用预览"
  7. 保存图表
  8. 返回列表
  9. 重新打开图表

Expected Results:
  - 步骤5: 画布显示 AI 生成的流程图预览
  - 步骤6: 预览内容正式应用到图表
  - 步骤9: 重新打开后显示 AI 生成的内容

Verification Points:
  ✓ AI 生成的图表可正常显示
  ✓ 应用预览后内容持久化
  ✓ 重新打开后内容保留
```

#### TC-E2E-003: 版本历史与回滚
```
Test Case: 版本管理和回滚

Steps:
  1. 创建新图表
  2. 添加节点 A
  3. 保存（版本1）
  4. 添加节点 B
  5. 保存（版本2）
  6. 查看版本历史
  7. 选择版本1并恢复
  8. 确认画布显示

Expected Results:
  - 步骤6: 显示两个版本记录
  - 步骤7: 成功恢复到版本1
  - 步骤8: 画布只显示节点A
```

---

### 2. 边界场景测试

#### TC-BOUND-001: 空图表处理
```
Test Case: 空图表的创建和打开

Steps:
  1. 创建新图表（不绘制任何内容）
  2. 直接保存
  3. 返回列表
  4. 重新打开

Expected:
  - 步骤2: 保存成功
  4. 步骤4: 显示空白画布（而非报错）
```

#### TC-BOUND-002: 大数据量图表
```
Test Case: 包含大量元素的图表

Steps:
  1. 创建图表
  2. 添加50个节点和100条连接线
  3. 保存
  4. 重新打开
  5. 测试画布交互（拖拽、缩放）

Expected:
  - 保存和加载时间在可接受范围（< 3秒）
  - 画布交互流畅，无卡顿
  - 所有元素正确渲染
```

#### TC-BOUND-003: 特殊字符处理
```
Test Case: 节点文本包含特殊字符

Test Data:
  - "用户 <输入>"
  - "支付&验证"
  - "订单'状态'"
  - "流程\"说明\""

Steps:
  1. 创建包含特殊字符文本的节点
  2. 保存并重新打开
  3. 导出为 PNG

Expected:
  - 特殊字符正确显示
  - 导出图片中文本正常
```

---

## 四、回归测试套件

### 关键路径测试

```
Suite: 核心功能回归

1. 创建图表 ✓
2. 绘制基本图形（矩形、菱形、椭圆） ✓
3. 添加箭头连接 ✓
4. 编辑节点文本 ✓
5. 拖拽移动节点 ✓
6. 删除节点 ✓
7. 保存图表 ✓
8. 返回列表 ✓
9. 重新打开图表（内容完整） ✓ ← 关键验证点
10. 应用模板 ✓
11. AI 文本生成 ✓
12. 导出图片 ✓
```

---

## 五、测试数据准备

### 测试图表数据

```typescript
// 基础流程图
export const testFlowchart = {
  title: "用户注册流程",
  elements: [
    { id: "start", type: "rectangle", x: 300, y: 100, width: 120, height: 60, text: "开始" },
    { id: "input", type: "rectangle", x: 300, y: 200, width: 160, height: 60, text: "输入手机号" },
    { id: "verify", type: "diamond", x: 300, y: 320, width: 140, height: 100, text: "验证通过？" },
    { id: "success", type: "rectangle", x: 500, y: 340, width: 120, height: 60, text: "注册成功" },
    { id: "fail", type: "rectangle", x: 100, y: 340, width: 120, height: 60, text: "提示错误" },
    { id: "end", type: "rectangle", x: 500, y: 450, width: 120, height: 60, text: "结束" },
    { id: "arrow1", type: "arrow", text: "start->input" },
    { id: "arrow2", type: "arrow", text: "input->verify" },
    { id: "arrow3", type: "arrow", text: "verify->success" },
    { id: "arrow4", type: "arrow", text: "verify->fail" },
    { id: "arrow5", type: "arrow", text: "success->end" }
  ]
};

// 空图表
export const emptyDiagram = {
  title: "空图表",
  elements: []
};

// 单节点图表
export const singleNodeDiagram = {
  title: "单节点",
  elements: [
    { id: "node1", type: "rectangle", x: 100, y: 100, width: 150, height: 80, text: "测试节点" }
  ]
};
```

---

## 六、测试执行计划

| 阶段 | 测试类型 | 执行频率 | 负责人 |
|------|---------|---------|--------|
| 开发期 | 单元测试 | 每次提交前 | 开发者 |
| 集成期 | 集成测试 | 每日构建 | CI/CD |
| 发布前 | E2E测试 | 每次发布前 | QA |
| 回归 | 关键路径 | 每次PR合并 | 自动化 |

---

## 七、已知问题与测试注意

1. **Excalidraw 初始化竞态**: 已通过传入 initialData 修复，测试时需验证重新打开图表场景
2. **箭头绑定延迟**: 首次渲染时箭头可能短暂显示为中心连接，测试时应等待画布完全稳定后再验证
3. **缩放比例恢复**: 保存时如包含 appState，重新打开时应恢复相同的缩放比例
