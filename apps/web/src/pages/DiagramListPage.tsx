import { useMemo, useState } from "react";

import type { DiagramEngineType, DiagramRecord } from "../types";

type DiagramListPageProps = {
  diagrams: DiagramRecord[];
  onOpenDiagram: (id: string) => Promise<void>;
  onCreateDiagram: (title: string, engineType: DiagramEngineType) => Promise<void>;
};

export function DiagramListPage({ diagrams, onOpenDiagram, onCreateDiagram }: DiagramListPageProps) {
  const [title, setTitle] = useState("新建图表");
  const [engineType, setEngineType] = useState<DiagramEngineType>("reactflow_elk");
  const formatDate = useMemo(
    () =>
      new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
    []
  );

  const stats = useMemo(() => {
    const reactFlowCount = diagrams.filter((diagram) => diagram.engineType === "reactflow_elk").length;
    const excalidrawCount = diagrams.length - reactFlowCount;
    const totalNodes = diagrams.reduce((total, diagram) => total + diagram.elements.length, 0);
    return {
      total: diagrams.length,
      reactFlowCount,
      excalidrawCount,
      totalNodes
    };
  }, [diagrams]);

  const orderedDiagrams = useMemo(
    () =>
      [...diagrams].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    [diagrams]
  );

  const handleCreate = async () => {
    await onCreateDiagram(title, engineType);
  };

  return (
    <section className="dashboard-page">
      <div className="dashboard-glow dashboard-glow-left" aria-hidden="true" />
      <div className="dashboard-glow dashboard-glow-right" aria-hidden="true" />

      <header className="dashboard-hero">
        <div className="hero-main">
          <p className="hero-kicker">AI Diagram Studio</p>
          <h1>让图表生成和改图像对话一样高效</h1>
          <p className="hero-subtitle">文本、图片、文档到结构化图表，支持持续上下文与结果预览。</p>
        </div>

        <div className="hero-metrics" aria-label="图表统计">
          <article className="metric-card">
            <p>总图表</p>
            <strong>{stats.total}</strong>
          </article>
          <article className="metric-card">
            <p>React Flow + ELK</p>
            <strong>{stats.reactFlowCount}</strong>
          </article>
          <article className="metric-card">
            <p>Excalidraw</p>
            <strong>{stats.excalidrawCount}</strong>
          </article>
          <article className="metric-card">
            <p>节点总量</p>
            <strong>{stats.totalNodes}</strong>
          </article>
        </div>
      </header>

      <section className="create-shell" aria-label="创建图表">
        <div className="create-headline">
          <h2>新建工作区</h2>
          <p>流程图默认创建，选择绘图引擎后直接进入可编辑画布。</p>
        </div>
        <form
          className="create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <label className="field-block" htmlFor="diagram-title">
            标题
            <input
              id="diagram-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：支付结算流程"
            />
          </label>
          <label className="field-block" htmlFor="diagram-engine">
            绘图风格引擎
            <select
              id="diagram-engine"
              value={engineType}
              onChange={(event) => setEngineType(event.target.value as DiagramEngineType)}
            >
              <option value="reactflow_elk">React Flow + ELK（默认）</option>
              <option value="excalidraw">Excalidraw</option>
            </select>
          </label>
          <button type="submit" className="primary-btn create-submit">
            创建图表
          </button>
        </form>
      </section>

      <section className="diagram-section" aria-label="图表列表">
        <div className="section-head">
          <h2>最近图表</h2>
          <p>按最近更新时间排序，快速回到上次工作进度。</p>
        </div>

        {orderedDiagrams.length > 0 ? (
          <ul className="diagram-grid">
            {orderedDiagrams.map((diagram) => (
              <li key={diagram.id} className="diagram-card">
                <div className="diagram-card-top">
                  <h3>{diagram.title}</h3>
                  <span className="diagram-kind">流程图</span>
                </div>
                <p className="diagram-id">{diagram.id}</p>
                <div className="diagram-card-meta">
                  <span>版本 {diagram.currentVersion}</span>
                  <span>{diagram.elements.length} 个节点</span>
                </div>
                <div className="diagram-card-meta">
                  <span>{diagram.engineType === "reactflow_elk" ? "React Flow + ELK" : "Excalidraw"}</span>
                </div>
                <div className="diagram-card-meta">
                  <span>更新于 {formatDate.format(new Date(diagram.updatedAt))}</span>
                </div>
                <div className="diagram-card-actions">
                  <button type="button" onClick={() => void onOpenDiagram(diagram.id)}>
                    打开图表
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <h3>还没有图表</h3>
            <p>先创建一个图表，系统会自动进入编辑器并保存初始版本。</p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                void handleCreate();
              }}
            >
              立即创建
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
