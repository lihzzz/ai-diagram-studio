import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RENDER_CONFIG } from "@ai-diagram-studio/shared";

import { api } from "../api/client";
import { DiagramCanvas, type DiagramCanvasHandle } from "../components/DiagramCanvas";
import { ReasoningPanel } from "../components/ReasoningPanel";
import { ModelSettingsPanel } from "../components/ModelSettingsPanel";
import { TemplateIconPanel } from "../components/TemplateIconPanel";
import { useCatalogStore } from "../stores/catalogStore";
import { useEditorStore } from "../stores/editorStore";
import { useJobStore } from "../stores/jobStore";
import { useModelStore } from "../stores/modelStore";
import type { DiagramRecord } from "../types";

type EditorPageProps = {
  onBack: () => void;
  onDiagramUpdate: (diagram: DiagramRecord) => void;
};

export function EditorPage({ onBack, onDiagramUpdate }: EditorPageProps) {
  const { currentDiagram, elements, selection, setDiagram, setElements, setSelection, pushHistory } = useEditorStore();
  const {
    setRunning,
    setResult,
    activeJobId,
    previewElements,
    reasoningSummary,
    error: jobError,
    undoStack,
    setHistory,
    setLastInputText,
    pushSnapshot,
    popSnapshot,
    clearAll,
    reset: resetJob
  } = useJobStore();
  const { styleTemplates, activeStyleTemplateId, setStyleTemplates, setActiveStyleTemplateId } = useCatalogStore();
  const { profiles, setProfiles } = useModelStore();

  const canvasRef = useRef<DiagramCanvasHandle | null>(null);

  const [saving, setSaving] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [rightTab, setRightTab] = useState<"ai" | "templates" | "settings">("ai");

  const hasPreview = useMemo(() => Boolean(activeJobId && previewElements && previewElements.length > 0), [activeJobId, previewElements]);

  const activeRenderConfig = useMemo(() => {
    const selected = styleTemplates.find((template) => template.id === activeStyleTemplateId);
    return selected?.renderConfig ?? DEFAULT_RENDER_CONFIG;
  }, [styleTemplates, activeStyleTemplateId]);

  const refreshMeta = async () => {
    if (!currentDiagram) return;
    const [templates, nextProfiles, jobs] = await Promise.all([
      api.listStyleTemplates(),
      api.listModelProfiles(),
      api.listDiagramJobs(currentDiagram.id)
    ]);
    setStyleTemplates(templates);
    setProfiles(nextProfiles);
    setHistory(jobs);

    if (!activeStyleTemplateId && templates.length > 0) {
      const builtinDefault = templates.find((item) => item.isBuiltin) ?? templates[0];
      setActiveStyleTemplateId(builtinDefault.id);
    } else if (activeStyleTemplateId && !templates.some((item) => item.id === activeStyleTemplateId)) {
      setActiveStyleTemplateId(null);
    }

    if (!reasoningSummary) {
      const latestSummary = jobs.find((job) => Boolean(job.reasoningSummary))?.reasoningSummary ?? null;
      if (latestSummary) {
        setResult({ status: "succeeded", progress: 100, previewElements: null, reasoningSummary: latestSummary, error: null });
      }
    }
  };

  useEffect(() => {
    clearAll();
    void refreshMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDiagram?.id]);

  useEffect(() => {
    setTitleDraft(currentDiagram?.title ?? "");
  }, [currentDiagram?.id, currentDiagram?.title]);

  const pollJob = async (jobId: string) => {
    let done = false;
    let latestResult: { status: string; progress: number; result: typeof previewElements; reasoningSummary: typeof reasoningSummary; error: string | null } | null = null;
    while (!done) {
      const result = await api.getGenerationJob(jobId);
      latestResult = result;
      setResult({ status: result.status, progress: result.progress, previewElements: result.result, reasoningSummary: result.reasoningSummary, error: result.error });
      if (result.status === "succeeded" || result.status === "failed") {
        done = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
    return latestResult;
  };

  const autoApplyGeneratedResult = async (jobId: string, diagramId: string) => {
    const result = await api.getGenerationJob(jobId);
    if (result.status !== "succeeded" || !result.result?.length) {
      if (result.status === "succeeded" && (!result.result || result.result.length === 0)) {
        setResult({ status: "failed", progress: 100, previewElements: null, reasoningSummary: result.reasoningSummary, error: "生成结果为空，请重试或简化输入描述" });
      }
      return;
    }
    pushSnapshot({ elements, reasoningSummary });
    try {
      await api.applyGenerationJob(jobId, diagramId);
      const fresh = await api.getDiagram(diagramId);
      setDiagram(fresh);
      onDiagramUpdate(fresh);
      await refreshMeta();
      resetJob();
      setResult({ status: "succeeded", progress: 100, previewElements: null, reasoningSummary: result.reasoningSummary, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动应用失败";
      setResult({ status: "succeeded", progress: 100, previewElements: result.result, reasoningSummary: result.reasoningSummary, error: `自动应用失败: ${message}` });
    }
  };

  const runGeneration = async (body: { mode: "text"; diagramType: "flowchart" | "module_architecture"; inputText: string; templateId?: string; previousReasoning?: Record<string, unknown>; existingElements?: typeof elements }) => {
    if (!currentDiagram) return;
    try {
      const diagramId = currentDiagram.id;
      const { jobId } = await api.createGenerationJob({ ...body, diagramId });
      setRunning(jobId);
      const finalResult = await pollJob(jobId);
      if (finalResult?.status === "succeeded") {
        await autoApplyGeneratedResult(jobId, diagramId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败";
      setResult({ status: "failed", progress: 100, previewElements: null, reasoningSummary: null, error: message });
    }
  };

  const handleRunText = async (inputText: string, diagramType: "flowchart" | "module_architecture") => {
    setLastInputText(inputText);
    const payload: Parameters<typeof runGeneration>[0] = { mode: "text", diagramType, inputText };
    if (activeStyleTemplateId) payload.templateId = activeStyleTemplateId;
    if (reasoningSummary && elements.length > 0) {
      payload.previousReasoning = reasoningSummary;
      payload.existingElements = elements;
    }
    await runGeneration(payload);
  };

  const undoGeneration = () => {
    const snapshot = popSnapshot();
    if (!snapshot) return;
    setElements(snapshot.elements);
    setResult({ status: "succeeded", progress: 100, previewElements: null, reasoningSummary: snapshot.reasoningSummary, error: null });
  };

  const saveDiagram = async () => {
    if (!currentDiagram) return;
    setSaving(true);
    try {
      pushHistory();
      const updated = await api.saveDiagram(currentDiagram.id, { title: titleDraft.trim() || currentDiagram.title, elements, appState: currentDiagram.appState });
      setDiagram(updated);
      onDiagramUpdate(updated);
      await refreshMeta();
    } finally {
      setSaving(false);
    }
  };

  const setDefaultModel = async (modelProfileId: string) => {
    await api.setDefaultModelProfile(modelProfileId);
    const nextProfiles = await api.listModelProfiles();
    setProfiles(nextProfiles);
  };

  const createModelProfile = async (payload: { provider: string; model: string; apiBase?: string; apiKey?: string; qualityRank: number; enabled: boolean }) => {
    await api.createModelProfile(payload);
    const nextProfiles = await api.listModelProfiles();
    setProfiles(nextProfiles);
  };

  const testModelProfile = async (profileId: string) => {
    const result = await api.checkModelProfile(profileId);
    return { available: result.available, reason: result.reason, httpStatus: result.httpStatus, latencyMs: result.latencyMs };
  };

  const uploadStyleTemplate = async (file: File) => {
    const created = await api.createStyleTemplate(file);
    const next = await api.listStyleTemplates();
    setStyleTemplates(next);
    setActiveStyleTemplateId(created.id);
  };

  const analyzeStyleTemplate = async (templateId: string) => {
    await api.analyzeStyleTemplate(templateId);
    const next = await api.listStyleTemplates();
    setStyleTemplates(next);
  };

  const deleteStyleTemplate = async (templateId: string) => {
    await api.deleteStyleTemplate(templateId);
    const next = await api.listStyleTemplates();
    setStyleTemplates(next);
    if (activeStyleTemplateId === templateId) setActiveStyleTemplateId(null);
  };

  const handleSelect = useCallback((ids: string[]) => setSelection(ids), [setSelection]);

  const handleElementsChange = useCallback((nextElements: typeof elements) => {
    if (!hasPreview) setElements(nextElements);
  }, [hasPreview, setElements]);

  const defaultModel = useMemo(() => profiles.find((p) => p.isDefault) ?? profiles[0], [profiles]);

  if (!currentDiagram) {
    return (
      <div className="page">
        <button type="button" onClick={onBack}>返回列表</button>
        <div className="empty-tip">未选择图表</div>
      </div>
    );
  }

  return (
    <div className="editor-shell">
      {/* ── Top Toolbar ── */}
      <header className="ed-toolbar">
        <div className="ed-toolbar-left">
          <button className="ed-tool-btn" onClick={onBack} title="返回列表">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="ed-divider" />
          <div>
            <div className="ed-title-row">
              <input
                className="ed-title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="图表标题"
              />
              <span className={`ed-save-status ${saving ? "ed-save-status--saving" : "ed-save-status--saved"}`}>
                {saving ? "保存中..." : "已保存"}
              </span>
            </div>
          </div>
        </div>

        <div className="ed-toolbar-center">
          <button className="ed-tool-btn" onClick={undoGeneration} disabled={undoStack.length === 0} title="撤销">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 10h13a4 4 0 010 8H7" /><path d="M3 10l4-4M3 10l4 4" /></svg>
          </button>
          <button className="ed-tool-btn" title="重做" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10H8a4 4 0 000 8h9" /><path d="M21 10l-4-4M21 10l-4 4" /></svg>
          </button>
          <div className="ed-divider" />
          <span className="ed-zoom-label">100%</span>
        </div>

        <div className="ed-toolbar-right">
          <button className="ed-export-btn" onClick={() => {
            const opts = canvasRef.current?.getExportOptions();
            if (!opts) return;
            // Trigger canvas export via the DiagramCanvas's own buttons
            const pane = document.querySelector('.react-flow__viewport') as HTMLElement;
            if (!pane) return;
            void (async () => {
              try {
                const { toPng } = await import('html-to-image');
                const url = await toPng(pane, { pixelRatio: 2, backgroundColor: activeRenderConfig.canvas.background });
                const a = document.createElement('a');
                a.href = url;
                a.download = `${currentDiagram.title}.png`;
                a.click();
              } catch { /* silent */ }
            })();
          }} title="导出 PNG">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
            导出
          </button>
          <div className="ed-avatar" />
        </div>
      </header>

      {/* ── Main Layout ── */}
      <div className="ed-body">
        {/* Floating left toolbar */}
        <aside className="ed-float-toolbar">
          <button className="ed-float-btn ed-float-btn--active" title="选择">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-6 2-3 7z" /></svg>
          </button>
          <button className="ed-float-btn" title="拖拽">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg>
          </button>
          <div className="ed-float-sep" />
          <button className="ed-float-btn" title="矩形">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
          </button>
          <button className="ed-float-btn" title="菱形">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l10 10-10 10L2 12z" /></svg>
          </button>
          <button className="ed-float-btn" title="圆形">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
          </button>
          <button className="ed-float-btn" title="连线">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
          <button className="ed-float-btn" title="文本">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg>
          </button>
          <div className="ed-float-sep" />
          <button className="ed-float-btn ed-float-btn--danger" title="清除">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 4h4l1-1h8l1 1h4L17 20" /></svg>
          </button>
        </aside>

        {/* Canvas area */}
        <main className="ed-canvas-area">
          <DiagramCanvas
            ref={canvasRef}
            elements={hasPreview ? (previewElements ?? []) : elements}
            selection={selection}
            renderConfig={activeRenderConfig}
            readOnly={hasPreview}
            saving={saving}
            onSave={saveDiagram}
            onSelect={handleSelect}
            onElementsChange={handleElementsChange}
          />

          {/* Bottom floating bar */}
          <div className="ed-bottom-bar">
            <div className="ed-bottom-item">
              <span className="ed-bottom-dot ed-bottom-dot--blue" />
              <span>节点: {elements.length}</span>
            </div>
            <div className="ed-bottom-sep" />
            <div className="ed-bottom-item">
              <span className="ed-bottom-dot ed-bottom-dot--purple" />
              <span>连接: {elements.filter((e) => e.type === "arrow").length}</span>
            </div>
            <div className="ed-bottom-sep" />
            <div className="ed-bottom-item">
              <span className="ed-bottom-label">模型:</span>
              <span className="ed-bottom-model-badge">
                {defaultModel?.model ?? "未配置"}
              </span>
            </div>
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="ed-right-sidebar">
          <div className="ed-sidebar-tabs">
            <button className={`ed-sidebar-tab ${rightTab === "ai" ? "ed-sidebar-tab--active" : ""}`} onClick={() => setRightTab("ai")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a4 4 0 014 4c0 1.1-.9 2-2 2h-4a2 2 0 01-2-2 4 4 0 014-4z" /><path d="M8 8v2a4 4 0 004 4h0a4 4 0 004-4V8" /><path d="M12 14v4M8 22h8" /></svg>
              AI
            </button>
            <button className={`ed-sidebar-tab ${rightTab === "templates" ? "ed-sidebar-tab--active" : ""}`} onClick={() => setRightTab("templates")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
              模板
            </button>
            <button className={`ed-sidebar-tab ${rightTab === "settings" ? "ed-sidebar-tab--active" : ""}`} onClick={() => setRightTab("settings")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
              设置
            </button>
          </div>

          <div className="ed-sidebar-content">
            {rightTab === "ai" && (
              <>
                <ReasoningPanel
                  summary={reasoningSummary}
                  onAskFollowup={async (instruction) => {
                    await handleRunText(instruction, currentDiagram.type);
                  }}
                />
                <div className="ed-ai-input-area">
                  <AiChatInput
                    onGenerate={(text) => handleRunText(text, currentDiagram.type)}
                    hasExisting={elements.length > 0}
                    running={!!activeJobId}
                  />
                </div>
              </>
            )}

            {rightTab === "templates" && (
              <TemplateIconPanel
                styleTemplates={styleTemplates}
                activeStyleTemplateId={activeStyleTemplateId}
                onSelectStyleTemplate={setActiveStyleTemplateId}
                onUploadStyleTemplate={uploadStyleTemplate}
                onAnalyzeStyleTemplate={analyzeStyleTemplate}
                onDeleteStyleTemplate={deleteStyleTemplate}
                styleTemplatePreviewUrl={api.styleTemplatePreviewUrl}
              />
            )}

            {rightTab === "settings" && (
              <ModelSettingsPanel
                profiles={profiles}
                onSetDefault={setDefaultModel}
                onCreateProfile={createModelProfile}
                onTestProfile={testModelProfile}
              />
            )}
          </div>
        </aside>
      </div>

      {reasoningSummary?.fallback ? <div className="ed-fallback-banner">当前结果由兜底策略生成，建议调整输入后重试模型生成。</div> : null}
      {jobError ? <div className="ed-error-banner">{jobError}</div> : null}
    </div>
  );
}

/* ── AI Chat Input ── */
function AiChatInput({ onGenerate, hasExisting, running }: { onGenerate: (text: string) => Promise<void>; hasExisting: boolean; running: boolean }) {
  const [text, setText] = useState("");

  const handleSend = async () => {
    if (!text.trim() || running) return;
    await onGenerate(text);
    setText("");
  };

  return (
    <div className="ed-chat-input">
      <textarea
        className="ed-chat-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
          }
        }}
        placeholder={hasExisting ? "描述要修改的地方…" : "描述你想要生成的图表…"}
        rows={3}
      />
      <div className="ed-chat-actions">
        <div className="ed-chat-chips">
          <button className="ed-chat-chip" onClick={() => setText((p) => p + "美化排版")}>美化排版</button>
          <button className="ed-chat-chip" onClick={() => setText((p) => p + "优化布局")}>优化布局</button>
          <button className="ed-chat-chip" onClick={() => setText((p) => p + "精简节点")}>精简节点</button>
        </div>
        <button className="ed-chat-send" onClick={() => void handleSend()} disabled={running || !text.trim()}>
          {running ? (
            <span className="ed-chat-loading">
              <span /><span /><span />
            </span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
