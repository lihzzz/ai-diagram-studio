# AI Diagram Studio 图表生成测试用例

## 测试用例结构说明

每个测试用例包含：
- **输入**: 自然语言描述或需求说明
- **预期输出**: 应包含的节点类型、数量和连接关系
- **验证要点**: 检查的关键指标
- **参考实现**: 预期的图表结构（JSON格式）

---

## 一、流程图测试用例

### TC-FLOW-001: 电商订单处理流程

#### 输入描述
```
请生成一个电商订单处理流程图，包含以下步骤：
1. 用户浏览商品并下单
2. 系统创建订单并锁定库存
3. 用户进行支付
4. 支付成功则发货，失败则取消订单
5. 发货后用户确认收货
6. 订单完成

需要包含：开始/结束节点、判断节点（支付成功？）、异常处理分支
```

#### 预期输出结构
```typescript
const expectedElements = {
  nodes: {
    count: 8,
    types: {
      rectangle: 6,  // 开始、下单、创建订单、发货、确认收货、完成
      diamond: 1,    // 支付成功？
      ellipse: 1     // 结束
    }
  },
  edges: {
    count: 9,
    connections: [
      { from: "开始", to: "用户下单" },
      { from: "用户下单", to: "创建订单" },
      { from: "创建订单", to: "支付" },
      { from: "支付", to: "支付成功？" },
      { from: "支付成功？", to: "发货", label: "是" },
      { from: "支付成功？", to: "取消订单", label: "否" },
      { from: "发货", to: "确认收货" },
      { from: "确认收货", to: "订单完成" },
      { from: "订单完成", to: "结束" }
    ]
  }
}
```

#### 验证要点
- [ ] 包含开始和结束节点
- [ ] 包含判断节点（菱形）处理支付结果分支
- [ ] 支付失败分支有明确的"取消订单"处理节点
- [ ] 箭头有方向性（带箭头头）
- [ ] 判断节点的分支有明确的是/否标签
- [ ] 节点布局合理，避免重叠
- [ ] 连接线不穿过节点中心

#### 参考结构
```json
{
  "title": "电商订单处理流程",
  "type": "flowchart",
  "elements": [
    { "id": "start", "type": "ellipse", "x": 400, "y": 50, "text": "开始" },
    { "id": "browse", "type": "rectangle", "x": 400, "y": 150, "text": "浏览商品" },
    { "id": "order", "type": "rectangle", "x": 400, "y": 250, "text": "用户下单" },
    { "id": "create", "type": "rectangle", "x": 400, "y": 350, "text": "创建订单\n锁定库存" },
    { "id": "pay", "type": "rectangle", "x": 400, "y": 450, "text": "用户支付" },
    { "id": "check", "type": "diamond", "x": 400, "y": 580, "text": "支付成功？" },
    { "id": "ship", "type": "rectangle", "x": 600, "y": 600, "text": "发货" },
    { "id": "cancel", "type": "rectangle", "x": 200, "y": 600, "text": "取消订单\n释放库存" },
    { "id": "confirm", "type": "rectangle", "x": 600, "y": 720, "text": "确认收货" },
    { "id": "complete", "type": "rectangle", "x": 600, "y": 820, "text": "订单完成" },
    { "id": "end", "type": "ellipse", "x": 600, "y": 920, "text": "结束" },
    { "id": "e1", "type": "arrow", "text": "start->browse" },
    { "id": "e2", "type": "arrow", "text": "browse->order" },
    { "id": "e3", "type": "arrow", "text": "order->create" },
    { "id": "e4", "type": "arrow", "text": "create->pay" },
    { "id": "e5", "type": "arrow", "text": "pay->check" },
    { "id": "e6", "type": "arrow", "text": "check->ship:是", "meta": { "label": "是" } },
    { "id": "e7", "type": "arrow", "text": "check->cancel:否", "meta": { "label": "否" } },
    { "id": "e8", "type": "arrow", "text": "ship->confirm" },
    { "id": "e9", "type": "arrow", "text": "confirm->complete" },
    { "id": "e10", "type": "arrow", "text": "complete->end" }
  ]
}
```

---

### TC-FLOW-002: 用户注册登录流程

#### 输入描述
```
设计一个用户注册和登录的完整流程：
1. 用户进入登录页面
2. 如果已有账号直接登录，没有则进入注册流程
3. 注册需要验证手机号、设置密码
4. 注册成功后自动登录
5. 登录需要验证账号密码
6. 登录失败3次后锁定账号
7. 登录成功后进入首页

注意：包含循环（密码错误重试）和并行处理（登录/注册选择）
```

#### 预期输出结构
```typescript
const expectedElements = {
  nodes: {
    count: 11,
    types: {
      rectangle: 8,
      diamond: 2,  // 是否有账号？、密码正确？
      ellipse: 1
    }
  },
  edges: {
    count: 12,
    keyPaths: [
      "登录页面 -> [是否有账号？] -> 否 -> 注册流程",
      "密码错误 -> 错误次数<3 -> 重试",
      "密码错误3次 -> 账号锁定"
    ]
  }
}
```

#### 验证要点
- [ ] 包含循环结构（密码错误重试）
- [ ] 包含计数逻辑（3次失败锁定）
- [ ] 注册成功后自动进入登录状态
- [ ] 判断节点有明确的条件文本
- [ ] 异常分支（账号锁定）有明确处理

---

### TC-FLOW-003: 退款售后流程

#### 输入描述
```
电商退款售后流程：
1. 用户申请退款/退货
2. 商家审核申请（同意/拒绝）
3. 如果同意退款：
   - 仅退款：直接退款给用户
   - 退货退款：用户寄回商品，商家确认后退款
4. 如果商家拒绝，用户可申诉到平台介入
5. 平台仲裁后执行最终处理

这是一个多角色（用户、商家、平台）的流程
```

#### 预期输出结构
```typescript
const expectedElements = {
  nodes: {
    count: 12,
    types: {
      rectangle: 9,
      diamond: 2,
      ellipse: 1
    }
  },
  edges: {
    count: 14,
    branches: [
      "审核结果分支：同意/拒绝",
      "退款类型分支：仅退款/退货退款",
      "申诉分支：用户申诉/接受结果"
    ]
  }
}
```

#### 验证要点
- [ ] 能处理多层级判断（审核->退款类型->申诉）
- [ ] 仅退款和退货退款路径不同
- [ ] 商家拒绝后有申诉机制
- [ ] 平台仲裁作为最终节点

---

## 二、架构图测试用例

### TC-ARCH-001: 微服务电商系统架构

#### 输入描述
```
设计一个微服务架构的电商系统，包含以下组件：

前端层：
- Web商城（Vue.js）
- 移动端App（React Native）
- 管理后台（React）

网关层：
- API网关（Kong/Nginx）
- 负载均衡器

核心服务层：
- 用户服务（User Service）
- 商品服务（Product Service）
- 订单服务（Order Service）
- 支付服务（Payment Service）
- 库存服务（Inventory Service）
- 购物车服务（Cart Service）

基础设施层：
- MySQL（主从）
- Redis（缓存）
- RabbitMQ（消息队列）
- Elasticsearch（搜索）
- MinIO/OSS（文件存储）

组件间关系：
- 前端通过网关访问服务
- 服务间通过MQ异步通信
- 订单服务调用支付、库存服务
- 所有服务共享Redis缓存
- 数据持久化到MySQL
```

#### 预期输出结构
```typescript
const expectedElements = {
  layers: {
    count: 4,
    names: ["前端层", "网关层", "服务层", "数据层"]
  },
  nodes: {
    count: 18,
    byLayer: {
      frontend: 3,      // Web、App、Admin
      gateway: 2,       // API网关、LB
      services: 6,      // 6个微服务
      data: 7           // MySQL、Redis、MQ、ES、OSS
    }
  },
  connections: {
    clientToGateway: 3,     // 3个前端到网关
    gatewayToService: 12,   // 网关到各服务
    serviceToService: 6,    // 服务间调用
    serviceToData: 15       // 服务到数据层
  }
}
```

#### 验证要点
- [ ] 按层次组织组件（从上到下：前端->网关->服务->数据）
- [ ] 同一层次组件水平对齐
- [ ] 连接线体现调用方向
- [ ] 数据层组件用不同颜色或形状标识
- [ ] 微服务间调用关系清晰
- [ ] 异步消息（MQ）用虚线或特殊样式表示

#### 参考结构
```json
{
  "title": "电商微服务架构",
  "type": "module_architecture",
  "elements": [
    // 前端层
    { "id": "web", "type": "rectangle", "x": 200, "y": 50, "text": "Web商城\nVue.js" },
    { "id": "app", "type": "rectangle", "x": 400, "y": 50, "text": "移动App\nReact Native" },
    { "id": "admin", "type": "rectangle", "x": 600, "y": 50, "text": "管理后台\nReact" },

    // 网关层
    { "id": "lb", "type": "rectangle", "x": 400, "y": 180, "text": "负载均衡\nNginx" },
    { "id": "gateway", "type": "rectangle", "x": 400, "y": 280, "text": "API网关\nKong" },

    // 服务层
    { "id": "user-svc", "type": "rectangle", "x": 100, "y": 420, "text": "用户服务\nUser Service" },
    { "id": "product-svc", "type": "rectangle", "x": 300, "y": 420, "text": "商品服务\nProduct Service" },
    { "id": "order-svc", "type": "rectangle", "x": 500, "y": 420, "text": "订单服务\nOrder Service" },
    { "id": "pay-svc", "type": "rectangle", "x": 700, "y": 420, "text": "支付服务\nPayment Service" },
    { "id": "inv-svc", "type": "rectangle", "x": 200, "y": 550, "text": "库存服务\nInventory" },
    { "id": "cart-svc", "type": "rectangle", "x": 600, "y": 550, "text": "购物车服务\nCart Service" },

    // 数据层
    { "id": "mysql", "type": "cylinder", "x": 150, "y": 700, "text": "MySQL\n主从集群" },
    { "id": "redis", "type": "rectangle", "x": 350, "y": 700, "text": "Redis\n缓存" },
    { "id": "mq", "type": "rectangle", "x": 550, "y": 700, "text": "RabbitMQ\n消息队列" },
    { "id": "es", "type": "rectangle", "x": 750, "y": 700, "text": "Elasticsearch\n搜索引擎" },

    // 连接线
    { "id": "c1", "type": "arrow", "text": "web->lb" },
    { "id": "c2", "type": "arrow", "text": "app->lb" },
    { "id": "c3", "type": "arrow", "text": "admin->lb" },
    { "id": "c4", "type": "arrow", "text": "lb->gateway" },
    { "id": "c5", "type": "arrow", "text": "gateway->user-svc" },
    { "id": "c6", "type": "arrow", "text": "gateway->product-svc" },
    { "id": "c7", "type": "arrow", "text": "gateway->order-svc" },
    { "id": "c8", "type": "arrow", "text": "gateway->pay-svc" },
    { "id": "c9", "type": "arrow", "text": "order-svc->pay-svc" },
    { "id": "c10", "type": "arrow", "text": "order-svc->inv-svc" },
    { "id": "c11", "type": "arrow", "text": "user-svc->mysql" },
    { "id": "c12", "type": "arrow", "text": "user-svc->redis" },
    { "id": "c13", "type": "arrow", "text": "order-svc->mq" }
  ]
}
```

---

### TC-ARCH-002: 支付系统架构

#### 输入描述
```
第三方支付系统架构：

接入层：
- 商户网关（多协议支持：HTTP/HTTPS、SDK）
- 风控网关（实时风控检查）
- 限流熔断器

核心业务层：
- 支付核心（交易处理）
- 渠道路由（多支付渠道智能选择）
- 账务系统（会计分录）
- 对账系统
- 清结算系统

渠道层：
- 支付宝渠道
- 微信支付渠道
- 银联渠道
- 海外支付渠道（PayPal、Stripe）

数据层：
- 交易数据库（分库分表）
- 账务数据库
- 流水日志（Kafka -> ClickHouse）
- 缓存（Redis集群）

安全组件：
- 加密服务（HSM）
- 签名验签服务
- 敏感数据脱敏
```

#### 预期输出结构
```typescript
const expectedElements = {
  layers: {
    count: 5,
    names: ["接入层", "业务层", "渠道层", "数据层", "安全层"]
  },
  nodes: {
    count: 20,
    categories: {
      gateway: 3,
      core: 5,
      channel: 4,
      data: 5,
      security: 3
    }
  }
}
```

#### 验证要点
- [ ] 风控和限流在接入层
- [ ] 渠道路由能选择多个支付渠道
- [ ] 账务和对账分离
- [ ] 安全组件独立标识
- [ ] 数据流向清晰（从上到下）

---

### TC-ARCH-003: 推荐系统架构

#### 输入描述
```
电商推荐系统架构：

数据来源：
- 用户行为日志（点击、收藏、加购、购买）
- 商品信息（类目、属性、价格）
- 用户画像（年龄、性别、偏好）

数据处理层：
- 实时流处理（Flink）
- 离线批处理（Spark）
- 特征工程平台

算法层：
- 召回层（多路召回：协同过滤、向量召回、热门）
- 排序层（精排模型：DeepFM、DIN）
- 重排层（多样性、新鲜度、业务规则）

服务层：
- 推荐API服务
- AB实验平台
- 效果监控系统

存储层：
- 特征存储（Feature Store）
- 模型仓库
- 向量数据库（Milvus）
```

#### 预期输出结构
```typescript
const expectedElements = {
  flow: "数据流：数据源 -> 处理 -> 算法 -> 服务",
  nodes: {
    count: 16,
    stages: ["数据", "处理", "算法", "服务", "存储"]
  },
  keyFeature: "多层推荐流水线（召回->排序->重排）"
}
```

#### 验证要点
- [ ] 召回层包含多种召回方式
- [ ] 排序层明确标识为精排
- [ ] 特征存储和向量数据库区分
- [ ] AB实验平台作为独立组件

---

## 三、边界测试用例

### TC-EDGE-001: 极简流程（2个节点）

#### 输入描述
```
最简单的审批流程：提交申请 -> 审批通过
```

#### 预期输出
```typescript
{
  nodes: { count: 3 },  // 开始、审批、结束
  edges: { count: 2 },  // 开始->审批, 审批->结束
  layout: "线性排列"
}
```

#### 验证要点
- [ ] 能处理极少节点的场景
- [ ] 布局不重叠
- [ ] 箭头方向正确

---

### TC-EDGE-002: 复杂嵌套判断

#### 输入描述
```
多层级嵌套判断流程：
A -> 判断1（是->B，否->判断2）
判断2（是->C，否->判断3）
判断3（是->D，否->E）
```

#### 预期输出
```typescript
{
  nodes: { count: 8 },  // A,B,C,D,E + 3个判断 + 结束
  diamonds: { count: 3 },
  maxDepth: 3  // 最大嵌套层级
}
```

#### 验证要点
- [ ] 嵌套判断层级正确
- [ ] 无路径丢失
- [ ] 布局美观，不拥挤

---

### TC-EDGE-003: 环形依赖/循环

#### 输入描述
```
包含循环的流程：
步骤A -> 步骤B -> 判断 -> 失败则返回步骤A重试
```

#### 预期输出
```typescript
{
  nodes: { count: 4 },
  edges: { count: 4 },
  cycles: 1  // 1个循环
}
```

#### 验证要点
- [ ] 循环箭头用曲线或折线避免重叠
- [ ] 循环路径清晰可辨

---

### TC-EDGE-004: 多对多连接

#### 输入描述
```
星型架构：
中心服务A连接多个外围服务B,C,D,E
每个外围服务又连接到多个数据库
```

#### 预期输出
```typescript
{
  nodes: { count: 10 },
  edges: { count: 12 },
  crossing: "最小化"  // 连接线交叉最少
}
```

#### 验证要点
- [ ] 中心节点位置突出
- [ ] 连接线不混乱
- [ ] 层次清晰

---

## 四、测试执行模板

### 自动化验证脚本

```typescript
// test-generation.spec.ts
import { describe, it, expect } from 'vitest';
import { generateDiagram } from '../src/services/generation';

describe('AI图表生成测试', () => {
  it('TC-FLOW-001: 电商订单流程生成', async () => {
    const input = "电商订单处理流程，包含下单、支付、发货、完成";
    const result = await generateDiagram(input, 'flowchart');

    // 验证节点数量
    const nodes = result.elements.filter(e => e.type !== 'arrow');
    expect(nodes.length).toBeGreaterThanOrEqual(6);

    // 验证包含判断节点
    const diamonds = nodes.filter(e => e.type === 'diamond');
    expect(diamonds.length).toBeGreaterThanOrEqual(1);

    // 验证包含开始和结束
    const hasStart = nodes.some(n =>
      n.text?.toLowerCase().includes('开始') ||
      n.type === 'ellipse'
    );
    expect(hasStart).toBe(true);

    // 验证箭头连接正确
    const arrows = result.elements.filter(e => e.type === 'arrow');
    expect(arrows.length).toBeGreaterThanOrEqual(nodes.length - 1);
  });

  it('TC-ARCH-001: 微服务架构生成', async () => {
    const input = "微服务电商架构，包含网关、用户服务、订单服务、支付服务、MySQL、Redis";
    const result = await generateDiagram(input, 'module_architecture');

    // 验证分层结构
    const nodes = result.elements.filter(e => e.type !== 'arrow');
    const yPositions = nodes.map(n => n.y);
    const uniqueLayers = new Set(yPositions.map(y => Math.round(y / 100)));
    expect(uniqueLayers.size).toBeGreaterThanOrEqual(3);  // 至少3层

    // 验证包含数据库
    const hasDatabase = nodes.some(n =>
      n.text?.toLowerCase().includes('mysql') ||
      n.text?.toLowerCase().includes('redis') ||
      n.text?.toLowerCase().includes('数据库')
    );
    expect(hasDatabase).toBe(true);

    // 验证包含服务组件
    const hasServices = nodes.some(n =>
      n.text?.toLowerCase().includes('服务') ||
      n.text?.toLowerCase().includes('service')
    );
    expect(hasServices).toBe(true);
  });
});
```

---

## 五、人工验证检查清单

### 流程图验证清单

- [ ] **完整性**: 是否遗漏了输入描述中的步骤
- [ ] **顺序性**: 步骤顺序是否符合逻辑
- [ ] **判断覆盖**: 判断节点的分支是否完整（是/否都有）
- [ ] **开始结束**: 是否有明确的开始和结束节点
- [ ] **标签清晰**: 节点文本是否简洁明了
- [ ] **箭头方向**: 流程方向是否一致（通常从上到下）
- [ ] **布局美观**: 节点对齐，不重叠，间距合理

### 架构图验证清单

- [ ] **分层清晰**: 各层职责明确，层次分明
- [ ] **组件完整**: 输入描述的所有组件都有体现
- [ ] **连接准确**: 组件间关系正确
- [ ] **技术栈**: 技术选型符合描述
- [ ] **数据流向**: 数据流向清晰（通常从上到下或从左到右）
- [ ] **外部系统**: 第三方服务明确标识
- [ ] **冗余备份**: 高可用组件是否有冗余标识

### 通用验证清单

- [ ] **保存后重开**: 保存图表，返回列表，重新打开，内容完整
- [ ] **编辑流畅**: 拖拽、缩放、选中操作流畅
- [ ] **文本显示**: 中文、英文、数字、特殊字符正确显示
- [ ] **导出正常**: PNG/SVG导出后图像清晰，无截断
- [ ] **响应式**: 不同屏幕尺寸下布局自适应
