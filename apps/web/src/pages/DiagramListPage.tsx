import { useCallback, useMemo, useState, useEffect } from "react";

import { Icon as IconifyIcon } from "@iconify-icon/react";
import { DEFAULT_RENDER_CONFIG } from "@ai-diagram-studio/shared";

import { api, type StyleTemplateDto } from "../api/client";
import type { DiagramRecord } from "../types";

type DiagramListPageProps = {
  diagrams: DiagramRecord[];
  onOpenDiagram: (id: string) => Promise<void>;
  onCreateDiagram: (title: string) => Promise<void>;
};

function StylePreviewSvg({ renderConfig }: { renderConfig: NonNullable<StyleTemplateDto["renderConfig"]> }) {
  const { groupColors, canvas } = renderConfig;
  const colors = Object.values(groupColors).slice(0, 5);
  return (
    <svg viewBox="0 0 200 120" className="dlp-tpl-svg-preview" style={{ "--tpl-bg": canvas.background, "--tpl-edge": canvas.edgeColor } as React.CSSProperties}>
      <rect width="200" height="120" fill="var(--tpl-bg)" />
      {/* Group boxes */}
      <rect x="8" y="8" width="80" height="50" rx="6" fill={colors[0]} opacity="0.4" stroke={colors[0]} strokeWidth="1" />
      <rect x="100" y="8" width="92" height="30" rx="4" fill={colors[1]} opacity="0.35" stroke={colors[1]} strokeWidth="1" />
      <rect x="100" y="46" width="92" height="30" rx="4" fill={colors[2]} opacity="0.35" stroke={colors[2]} strokeWidth="1" />
      <rect x="8" y="66" width="55" height="46" rx="6" fill={colors[3]} opacity="0.4" stroke={colors[3]} strokeWidth="1" />
      {/* Nodes */}
      <rect x="18" y="18" width="30" height="16" rx="3" fill={colors[0]} />
      <rect x="54" y="18" width="24" height="16" rx="3" fill={colors[0]} />
      <rect x="110" y="16" width="36" height="12" rx="6" fill={colors[1]} />
      <rect x="156" y="16" width="26" height="12" rx="6" fill={colors[1]} />
      <rect x="110" y="54" width="30" height="12" rx="6" fill={colors[2]} />
      <rect x="150" y="54" width="32" height="12" rx="6" fill={colors[2]} />
      <ellipse cx="35" cy="89" rx="18" ry="10" fill={colors[3]} />
      <polygon points="180,85 192,89 180,93 168,89" fill={colors[4]} />
      {/* Edges */}
      <line x1="48" y1="26" x2="54" y2="26" stroke="var(--tpl-edge)" strokeWidth="1.2" />
      <line x1="78" y1="26" x2="90" y2="22" stroke="var(--tpl-edge)" strokeWidth="1.2" />
      <line x1="138" y1="22" x2="156" y2="22" stroke="var(--tpl-edge)" strokeWidth="1.2" />
      <line x1="125" y1="28" x2="125" y2="54" stroke="var(--tpl-edge)" strokeWidth="1.2" />
      <line x1="140" y1="60" x2="150" y2="60" stroke="var(--tpl-edge)" strokeWidth="1.2" />
      <line x1="63" y1="26" x2="80" y2="80" stroke="var(--tpl-edge)" strokeWidth="1.2" strokeDasharray="3,2" />
    </svg>
  );
}

export function DiagramListPage({ diagrams, onOpenDiagram, onCreateDiagram }: DiagramListPageProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [modelProfiles, setModelProfiles] = useState<Awaited<ReturnType<typeof api.listModelProfiles>>>([]);
  const [modelChecking, setModelChecking] = useState<Record<string, { status: "checking" | "ok" | "fail"; message: string }>>({});
  const [styleTemplates, setStyleTemplates] = useState<StyleTemplateDto[]>([]);
  const [activeStyleTemplateId, setActiveStyleTemplateId] = useState<string | null>(null);

  useEffect(() => {
    void api.listStyleTemplates().then(setStyleTemplates);
  }, []);

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
    const totalNodes = diagrams.reduce((t, d) => t + d.elements.length, 0);
    return { total: diagrams.length, totalNodes };
  }, [diagrams]);

  const orderedDiagrams = useMemo(
    () => [...diagrams].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [diagrams]
  );

  const handleCreate = async () => {
    await onCreateDiagram(createTitle.trim() || "未命名图表");
    setCreateOpen(false);
    setCreateTitle("");
  };

  const openModelPanel = async () => {
    const profiles = await api.listModelProfiles();
    setModelProfiles(profiles);
    setModelPanelOpen(true);
  };

  const checkModel = async (id: string) => {
    setModelChecking((prev) => ({ ...prev, [id]: { status: "checking", message: "测试中..." } }));
    try {
      const result = await api.checkModelProfile(id);
      setModelChecking((prev) => ({
        ...prev,
        [id]: {
          status: result.available ? "ok" : "fail",
          message: result.available ? `可用 · ${result.latencyMs}ms` : result.reason
        }
      }));
    } catch {
      setModelChecking((prev) => ({ ...prev, [id]: { status: "fail", message: "连接失败" } }));
    }
  };

  useEffect(() => {
    if (!modelPanelOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setModelPanelOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modelPanelOpen]);

  return (
    <div className="dlp">
      {/* Sidebar */}
      <aside className="dlp-sidebar">
        <div className="dlp-logo">
          <div className="dlp-logo-icon">
            <IconifyIcon icon="solar:diagram-up-bold-duotone" />
          </div>
          <span className="dlp-logo-text">Diagram Studio</span>
        </div>

        <nav className="dlp-nav">
          <a className="dlp-nav-link dlp-nav-link--active" href="#">
            <IconifyIcon icon="solar:widget-5-bold-duotone" className="dlp-nav-iconify" />
            <span>工作台</span>
          </a>
          <button className="dlp-nav-link" onClick={() => setCreateOpen(true)}>
            <IconifyIcon icon="solar:pen-new-square-bold-duotone" className="dlp-nav-iconify dlp-nav-iconify--blue" />
            <span>新建图表</span>
          </button>
          <a className="dlp-nav-link" href="#" onClick={(e) => { e.preventDefault(); openModelPanel(); }}>
            <IconifyIcon icon="solar:cpu-bold-duotone" className="dlp-nav-iconify dlp-nav-iconify--orange" />
            <span>模型中心</span>
          </a>
          <a className="dlp-nav-link" href="#">
            <IconifyIcon icon="solar:fire-bold-duotone" className="dlp-nav-iconify" />
            <span>模板库</span>
          </a>
        </nav>

        <div className="dlp-sidebar-footer">
          <div className="dlp-glass dlp-user-card">
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
            <IconifyIcon icon="solar:magnifer-linear" className="dlp-search-iconify" />
            <input placeholder="搜索图表、模板..." type="text" />
          </div>
          <div className="dlp-header-actions">
            <div className="dlp-status">
              <div className="dlp-status-dot" />
              <span>AI 模型连接正常</span>
            </div>
            <button className="dlp-btn-primary" onClick={() => setCreateOpen(true)}>
              <IconifyIcon icon="solar:add-circle-bold" width="16" />
              新建创作
            </button>
          </div>
        </header>

        {/* Stats */}
        <section className="dlp-stats">
          <div className="dlp-glass dlp-stat-card dlp-stat-card--blue">
            <div className="dlp-stat-glow dlp-stat-glow--blue" />
            <div className="dlp-stat-header">
              <div className="dlp-stat-icon-box dlp-stat-icon-box--blue">
                <IconifyIcon icon="solar:folder-with-files-bold-duotone" width="28" />
              </div>
            </div>
            <div className="dlp-stat-value">{stats.total}</div>
            <div className="dlp-stat-label">总图表数量</div>
          </div>
          <div className="dlp-glass dlp-stat-card dlp-stat-card--purple">
            <div className="dlp-stat-glow dlp-stat-glow--purple" />
            <div className="dlp-stat-header">
              <div className="dlp-stat-icon-box dlp-stat-icon-box--purple">
                <IconifyIcon icon="solar:magic-stick-3-bold-duotone" width="28" />
              </div>
            </div>
            <div className="dlp-stat-value">{stats.totalNodes}</div>
            <div className="dlp-stat-label">总节点数</div>
          </div>
          <div className="dlp-glass dlp-stat-card dlp-stat-card--orange">
            <div className="dlp-stat-glow dlp-stat-glow--orange" />
            <div className="dlp-stat-header">
              <div className="dlp-stat-icon-box dlp-stat-icon-box--orange">
                <IconifyIcon icon="solar:graph-up-bold-duotone" width="28" />
              </div>
            </div>
            <div className="dlp-stat-value">{stats.totalNodes > 0 ? "128ms" : "--"}</div>
            <div className="dlp-stat-label">平均渲染延迟</div>
          </div>
        </section>

        {/* Recent Diagrams */}
        <section className="dlp-section">
          <div className="dlp-section-head">
            <h2><IconifyIcon icon="solar:clock-circle-bold-duotone" width="20" className="dlp-section-icon--orange" /> 最近编辑的图表</h2>
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
                        <span className="dlp-type-badge dlp-type-badge--flow">流程</span>
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
                    <div className="dlp-plus-icon"><IconifyIcon icon="solar:add-circle-linear" width="28" /></div>
                  </div>
                </div>
                <div className="dlp-diagram-info">
                  <div className="dlp-diagram-title dlp-diagram-title--new">创建新画板</div>
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
            <h2><IconifyIcon icon="solar:star-fall-bold-duotone" width="20" className="dlp-section-icon--yellow" /> 预置风格模板</h2>
          </div>
          {styleTemplates.length > 0 ? (
            <div className="dlp-template-grid">
              {styleTemplates.map((tpl) => {
                const renderConfig = tpl.renderConfig ?? DEFAULT_RENDER_CONFIG;
                const colors = Object.values(renderConfig.groupColors).slice(0, 6);
                const isActive = activeStyleTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className={`dlp-template-card dlp-glass ${isActive ? "dlp-template-card--active" : ""}`}
                    onClick={() => setActiveStyleTemplateId(isActive ? null : tpl.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="dlp-tpl-preview">
                      {tpl.hasPreview ? (
                        <img
                          className="dlp-tpl-preview-img"
                          src={api.styleTemplatePreviewUrl(tpl.id)}
                          alt={tpl.name}
                        />
                      ) : (
                        <StylePreviewSvg renderConfig={renderConfig} />
                      )}
                    </div>
                    <div className="dlp-tpl-name-row">
                      <span className="dlp-tpl-name">{tpl.name}</span>
                      {tpl.isBuiltin && <span className="dlp-tpl-badge">内置</span>}
                    </div>
                    <div className="dlp-tpl-palette">
                      {colors.map((c, i) => (
                        <div key={i} className="dlp-tpl-color-dot" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dlp-template-empty">
              <IconifyIcon icon="solar:gallery-bold-duotone" width="32" className="dlp-template-empty-icon" />
              <p>暂无风格模板</p>
            </div>
          )}
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
            </div>
            <div className="dlp-modal-foot">
              <button className="dlp-btn-ghost" onClick={() => setCreateOpen(false)}>取消</button>
              <button className="dlp-btn-primary" onClick={() => void handleCreate()}>创建</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Model Center Modal */}
      {modelPanelOpen && (
        <div className="dlp-modal-overlay" onClick={() => setModelPanelOpen(false)}>
          <div className="dlp-modal dlp-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="dlp-modal-head">
              <h3><IconifyIcon icon="solar:server-square-bold-duotone" width="20" className="dlp-modal-icon--blue" /> 模型集群状态</h3>
              <button className="dlp-modal-close" onClick={() => setModelPanelOpen(false)}>×</button>
            </div>
            <div className="dlp-modal-body">
              {modelProfiles.length > 0 ? (
                <div className="model-list">
                  {modelProfiles.map((m) => {
                    const checkState = modelChecking[m.id];
                    return (
                      <div key={m.id} className={`model-card model-card--${m.isDefault ? "blue" : "default"}`}>
                        <div className="model-card-head">
                          <div>
                            <div className="model-card-name">{m.provider} · {m.model}</div>
                            <div className="model-card-meta">
                              {m.apiBase ? `Base: ${m.apiBase}` : "使用默认 API 地址"}
                              {m.isDefault && " · 默认模型"}
                            </div>
                          </div>
                          <div className="model-card-badges">
                            {m.isDefault && <span className="chip chip-ok">核心推理</span>}
                            {m.enabled ? <span className="chip chip-ok">已启用</span> : <span className="chip chip-off">已禁用</span>}
                            {checkState?.status === "ok" && <span className="chip chip-ok">✓ {checkState.message}</span>}
                            {checkState?.status === "fail" && <span className="chip chip-off">✗ {checkState.message}</span>}
                          </div>
                        </div>
                        {checkState?.status === "ok" && (
                          <div className="model-load-bar">
                            <div className="model-load-fill model-load-fill--green" style={{ width: "95%" }} />
                          </div>
                        )}
                        <div className="model-card-actions">
                          <button
                            className="dlp-btn-small"
                            disabled={checkState?.status === "checking"}
                            onClick={() => void checkModel(m.id)}
                          >
                            {checkState?.status === "checking" ? "测试中..." : "测试连接"}
                          </button>
                          {m.isDefault && <span className="model-default-label">当前使用模型</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="model-empty-state">
                  <div className="model-empty-icon"><IconifyIcon icon="solar:settings-minimalistic-bold-duotone" width="48" /></div>
                  <h4>暂无配置的模型</h4>
                  <p>请在编辑器的「设置」中添加模型配置</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
