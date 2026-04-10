import { useCallback, useMemo, useState } from "react";

import type { DiagramRecord } from "../types";

type DiagramListPageProps = {
  diagrams: DiagramRecord[];
  onOpenDiagram: (id: string) => Promise<void>;
  onCreateDiagram: (title: string, type: "flowchart" | "module_architecture") => Promise<void>;
};

export function DiagramListPage({ diagrams, onOpenDiagram, onCreateDiagram }: DiagramListPageProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState<"flowchart" | "module_architecture">("flowchart");


  const formatRelative = useCallback((iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN");
  }, []);

  const stats = useMemo(() => {
    const flowchartCount = diagrams.filter((d) => d.type === "flowchart").length;
    const architectureCount = diagrams.length - flowchartCount;
    const totalNodes = diagrams.reduce((t, d) => t + d.elements.length, 0);
    return { total: diagrams.length, flowchartCount, architectureCount, totalNodes };
  }, [diagrams]);

  const orderedDiagrams = useMemo(
    () => [...diagrams].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [diagrams]
  );

  const handleCreate = async () => {
    await onCreateDiagram(createTitle.trim() || "未命名图表", createType);
    setCreateOpen(false);
    setCreateTitle("");
  };

  return (
    <div className="dlp">
      {/* Sidebar */}
      <aside className="dlp-sidebar">
        <div className="dlp-logo">
          <div className="dlp-logo-icon" />
          <span className="dlp-logo-text">Diagram Studio</span>
        </div>

        <nav className="dlp-nav">
          <a className="dlp-nav-link dlp-nav-link--active" href="#">
            <span className="dlp-nav-icon" />
            <span>工作台</span>
          </a>
          <button className="dlp-nav-link" onClick={() => setCreateOpen(true)}>
            <span className="dlp-nav-icon" />
            <span>新建图表</span>
          </button>
          <a className="dlp-nav-link" href="#">
            <span className="dlp-nav-icon" />
            <span>模型中心</span>
          </a>
          <a className="dlp-nav-link" href="#">
            <span className="dlp-nav-icon" />
            <span>模板库</span>
          </a>
        </nav>

        <div className="dlp-sidebar-footer">
          <div className="dlp-glass">
            <div className="dlp-avatar" />
            <div className="dlp-user-info">
              <div className="dlp-user-name">本地用户</div>
              <div className="dlp-user-date">{new Date().toLocaleDateString("zh-CN")}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="dlp-main">
        {/* Header */}
        <header className="dlp-header">
          <div className="dlp-search">
            <span className="dlp-search-icon" />
            <input placeholder="搜索图表..." type="text" />
          </div>
          <div className="dlp-header-actions">
            <div className="dlp-status">
              <span className="dlp-status-dot" />
              <span>服务运行中</span>
            </div>
            <button className="dlp-btn-primary" onClick={() => setCreateOpen(true)}>
              + 新建图表
            </button>
          </div>
        </header>

        {/* Stats */}
        <section className="dlp-stats">
          <div className="dlp-glass dlp-stat-card dlp-stat-card--blue">
            <div className="dlp-stat-icon dlp-stat-icon--blue" />
            <div className="dlp-stat-value">{stats.total}</div>
            <div className="dlp-stat-label">总图表</div>
          </div>
          <div className="dlp-glass dlp-stat-card dlp-stat-card--green">
            <div className="dlp-stat-icon dlp-stat-icon--green" />
            <div className="dlp-stat-value">{stats.flowchartCount}</div>
            <div className="dlp-stat-label">流程图</div>
          </div>
          <div className="dlp-glass dlp-stat-card dlp-stat-card--orange">
            <div className="dlp-stat-icon dlp-stat-icon--orange" />
            <div className="dlp-stat-value">{stats.architectureCount}</div>
            <div className="dlp-stat-label">架构图</div>
          </div>
          <div className="dlp-glass dlp-stat-card dlp-stat-card--purple">
            <div className="dlp-stat-icon dlp-stat-icon--purple" />
            <div className="dlp-stat-value">{stats.totalNodes}</div>
            <div className="dlp-stat-label">总节点数</div>
          </div>
        </section>

        {/* Recent Diagrams */}
        <section className="dlp-section">
          <div className="dlp-section-head">
            <h2>最近编辑的图表</h2>
          </div>

          {orderedDiagrams.length > 0 ? (
            <div className="dlp-grid">
              {orderedDiagrams.map((diagram) => (
                <div
                  key={diagram.id}
                  className="dlp-diagram-card dlp-glass"
                  onClick={() => void onOpenDiagram(diagram.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="dlp-diagram-preview">
                    <div className="dlp-diagram-thumb">
                      <div className="dlp-diagram-thumb-inner">
                        {diagram.type === "flowchart" ? (
                          <span className="dlp-type-badge dlp-type-badge--flow">流程</span>
                        ) : (
                          <span className="dlp-type-badge dlp-type-badge--arch">架构</span>
                        )}
                        <div className="dlp-thumb-shapes">
                          {Array.from({ length: Math.min(diagram.elements.length, 6) }).map((_, i) => (
                            <div
                              key={i}
                              className={`dlp-thumb-shape dlp-thumb-shape--${i % 3}`}
                              style={{ left: `${15 + i * 28}px`, top: `${10 + (i % 2) * 30}px` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="dlp-diagram-info">
                    <div className="dlp-diagram-title">{diagram.title}</div>
                    <div className="dlp-diagram-meta">
                      <span>{diagram.elements.length} 节点</span>
                      <span className="dlp-dot" />
                      <span>{formatRelative(diagram.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* New card */}
              <div
                className="dlp-diagram-card dlp-diagram-card--new"
                onClick={() => setCreateOpen(true)}
                role="button"
                tabIndex={0}
              >
                <div className="dlp-diagram-preview">
                  <div className="dlp-diagram-thumb dlp-diagram-thumb--new">
                    <div className="dlp-plus-icon">+</div>
                  </div>
                </div>
                <div className="dlp-diagram-info">
                  <div className="dlp-diagram-title dlp-diagram-title--new">创建新图表</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="dlp-glass dlp-empty">
              <div className="dlp-empty-icon" />
              <h3>还没有图表</h3>
              <p>创建第一个图表开始你的旅程</p>
              <button className="dlp-btn-primary" onClick={() => setCreateOpen(true)}>
                立即创建
              </button>
            </div>
          )}
        </section>

        {/* Templates */}
        <section className="dlp-section dlp-templates-section">
          <div className="dlp-section-head">
            <h2>内置模板</h2>
          </div>
          <div className="dlp-template-grid">
            <div className="dlp-template-card dlp-glass">
              <div className="dlp-tpl-preview dlp-tpl-preview--flow">
                <div className="dlp-tpl-flow-demo" />
              </div>
              <div className="dlp-tpl-name">流程图模板</div>
            </div>
            <div className="dlp-template-card dlp-glass">
              <div className="dlp-tpl-preview dlp-tpl-preview--arch">
                <div className="dlp-tpl-arch-demo" />
              </div>
              <div className="dlp-tpl-name">三层架构</div>
            </div>
            <div className="dlp-template-card dlp-glass">
              <div className="dlp-tpl-preview dlp-tpl-preview--order">
                <div className="dlp-tpl-order-demo" />
              </div>
              <div className="dlp-tpl-name">订单流程</div>
            </div>
          </div>
        </section>
      </main>

      {/* Create Modal */}
      {createOpen ? (
        <div className="dlp-modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="dlp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dlp-modal-head">
              <h3>新建图表</h3>
              <button className="dlp-modal-close" onClick={() => setCreateOpen(false)}>×</button>
            </div>
            <div className="dlp-modal-body">
              <label className="dlp-field">
                <span>标题</span>
                <input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="例如：支付结算流程"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
                />
              </label>
              <label className="dlp-field">
                <span>类型</span>
                <div className="dlp-type-selector">
                  <button
                    className={`dlp-type-btn ${createType === "flowchart" ? "dlp-type-btn--active" : ""}`}
                    onClick={() => setCreateType("flowchart")}
                  >
                    流程图
                  </button>
                  <button
                    className={`dlp-type-btn ${createType === "module_architecture" ? "dlp-type-btn--active" : ""}`}
                    onClick={() => setCreateType("module_architecture")}
                  >
                    模块架构图
                  </button>
                </div>
              </label>
            </div>
            <div className="dlp-modal-foot">
              <button className="dlp-btn-ghost" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="dlp-btn-primary" onClick={() => void handleCreate()}>创建</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
