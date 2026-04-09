import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import { AiPanel } from "../components/AiPanel";
import { DiagramCanvas } from "../components/DiagramCanvas";
import { ReactFlowCanvas } from "../components/ReactFlowCanvas";
import { ModelSettingsPanel } from "../components/ModelSettingsPanel";
import { ReasoningPanel } from "../components/ReasoningPanel";
import { TemplateIconPanel } from "../components/TemplateIconPanel";
import { useAssetStore } from "../stores/assetStore";
import { useCatalogStore } from "../stores/catalogStore";
import { useChatStore } from "../stores/chatStore";
import { useEditorStore } from "../stores/editorStore";
import { useJobStore } from "../stores/jobStore";
import { useModelStore } from "../stores/modelStore";
import type { DiagramEngineType, DiagramRecord } from "../types";

type EditorPageProps = {
  onBack: () => void;
  onDiagramUpdate: (diagram: DiagramRecord) => void;
};

export function EditorPage({ onBack, onDiagramUpdate }: EditorPageProps) {
  const {
    currentDiagram,
    elements,
    selection,
    setDiagram,
    setElements,
    setSelection,
    pushHistory,
    undoLocal
  } = useEditorStore();
  const { setRunning, setResult, activeJobId, previewElements, reasoningSummary, error: jobError, reset: resetJob } = useJobStore();
  const { addAsset, setChunks } = useAssetStore();
  const { sessionId, setSessionId, addTurn } = useChatStore();
  const { templates, icons, setTemplates, setIcons } = useCatalogStore();
  const { profiles, setProfiles } = useModelStore();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [engineDraft, setEngineDraft] = useState<DiagramEngineType>("reactflow_elk");

  const hasPreview = useMemo(() => Boolean(activeJobId && previewElements && previewElements.length > 0), [activeJobId, previewElements]);
  const canApplyPreview = useMemo(() => hasPreview, [hasPreview]);

  const refreshMeta = async () => {
    if (!currentDiagram) {
      return;
    }
    const [nextTemplates, nextIcons, nextProfiles] = await Promise.all([
      api.listTemplates(),
      api.listIcons(),
      api.listModelProfiles()
    ]);
    setTemplates(nextTemplates);
    setIcons(nextIcons);
    setProfiles(nextProfiles);
  };

  useEffect(() => {
    resetJob();
    void refreshMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDiagram?.id]);

  useEffect(() => {
    setTitleDraft(currentDiagram?.title ?? "");
  }, [currentDiagram?.id, currentDiagram?.title]);

  useEffect(() => {
    setEngineDraft(currentDiagram?.engineType ?? "reactflow_elk");
  }, [currentDiagram?.engineType]);

  const pollJob = async (jobId: string) => {
    let done = false;
    let latestResult:
      | {
          status: "pending" | "running" | "succeeded" | "failed";
          progress: number;
          result: typeof previewElements;
          reasoningSummary: typeof reasoningSummary;
          error: string | null;
        }
      | null = null;
    while (!done) {
      const result = await api.getGenerationJob(jobId);
      latestResult = result;
      setResult({
        status: result.status,
        progress: result.progress,
        previewElements: result.result,
        reasoningSummary: result.reasoningSummary,
        error: result.error
      });
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
        setResult({
          status: "failed",
          progress: 100,
          previewElements: null,
          reasoningSummary: result.reasoningSummary,
          error: "生成结果为空，请重试或简化输入描述"
        });
      }
      return;
    }
    try {
      await api.applyGenerationJob(jobId, diagramId);
      const fresh = await api.getDiagram(diagramId);
      setDiagram(fresh);
      onDiagramUpdate(fresh);
      await refreshMeta();
      resetJob();
      setResult({
        status: "succeeded",
        progress: 100,
        previewElements: null,
        reasoningSummary: result.reasoningSummary,
        error: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动应用失败";
      setResult({
        status: "succeeded",
        progress: 100,
        previewElements: result.result,
        reasoningSummary: result.reasoningSummary,
        error: `自动应用失败: ${message}`
      });
    }
  };

  const runGeneration = async (body: Record<string, unknown>) => {
    if (!currentDiagram) {
      return;
    }
    try {
      const diagramId = currentDiagram.id;
      const { jobId } = await api.createGenerationJob({
        ...body,
        diagramType: "flowchart",
        diagramId
      });
      setRunning(jobId);
      const finalResult = await pollJob(jobId);
      if (finalResult?.status === "succeeded") {
        await autoApplyGeneratedResult(jobId, diagramId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成失败";
      setResult({
        status: "failed",
        progress: 100,
        previewElements: null,
        reasoningSummary: null,
        error: message
      });
    }
  };

  const handleRunText = async (inputText: string) => {
    await runGeneration({
      mode: "text",
      inputText
    });
  };

  const handleRunImage = async (file: File) => {
    if (engineDraft === "excalidraw") {
      setResult({
        status: "failed",
        progress: 100,
        previewElements: null,
        reasoningSummary: null,
        error: "当前引擎仅支持文本/对话改图，请切换到 React Flow + ELK 后使用图生图。"
      });
      return;
    }
    const asset = await api.uploadAsset(file);
    addAsset(asset);
    await api.parseAsset(asset.id);
    await runGeneration({
      mode: "image",
      assetId: asset.id
    });
  };

  const handleRunDocument = async (file: File, parseFirst: boolean) => {
    if (engineDraft === "excalidraw") {
      setResult({
        status: "failed",
        progress: 100,
        previewElements: null,
        reasoningSummary: null,
        error: "当前引擎仅支持文本/对话改图，请切换到 React Flow + ELK 后使用文档生图。"
      });
      return;
    }
    const asset = await api.uploadAsset(file);
    addAsset(asset);
    if (parseFirst) {
      await api.parseAsset(asset.id);
      const chunks = await api.listAssetChunks(asset.id);
      setChunks(chunks);
    }
    await runGeneration({
      mode: "document",
      assetId: asset.id
    });
  };

  const handleRunChat = async (instruction: string) => {
    if (!currentDiagram) {
      return;
    }
    const diagramId = currentDiagram.id;
    let nextSessionId = sessionId;
    if (!nextSessionId) {
      const created = await api.createChatSession(diagramId);
      nextSessionId = created.sessionId;
      setSessionId(created.sessionId);
    }
    const turn = await api.createChatTurn(nextSessionId, {
      content: instruction,
      selection
    });
    addTurn({ role: "user", content: instruction });
    setRunning(turn.jobId);
    const finalResult = await pollJob(turn.jobId);
    if (finalResult?.status === "succeeded") {
      await autoApplyGeneratedResult(turn.jobId, diagramId);
    }
  };

  const applyPreview = async () => {
    if (!currentDiagram || !activeJobId) {
      return;
    }
    setBusy(true);
    try {
      await api.applyGenerationJob(activeJobId, currentDiagram.id);
      const fresh = await api.getDiagram(currentDiagram.id);
      setDiagram(fresh);
      onDiagramUpdate(fresh);
      await refreshMeta();
      const savedReasoning = reasoningSummary;
      resetJob();
      setResult({
        status: "succeeded",
        progress: 100,
        previewElements: null,
        reasoningSummary: savedReasoning,
        error: null
      });
    } finally {
      setBusy(false);
    }
  };

  const saveDiagram = async () => {
    if (!currentDiagram) {
      return;
    }
    setSaving(true);
    try {
      pushHistory();
      const updated = await api.saveDiagram(currentDiagram.id, {
        title: titleDraft.trim() || currentDiagram.title,
        engineType: engineDraft,
        elements,
        appState: currentDiagram.appState
      });
      setDiagram(updated);
      onDiagramUpdate(updated);
      await refreshMeta();
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    if (!currentDiagram) {
      return;
    }
    await api.applyTemplate(templateId, currentDiagram.id);
    const fresh = await api.getDiagram(currentDiagram.id);
    setDiagram(fresh);
    onDiagramUpdate(fresh);
    await refreshMeta();
  };

  const setDefaultModel = async (modelProfileId: string) => {
    await api.setDefaultModelProfile(modelProfileId);
    const nextProfiles = await api.listModelProfiles();
    setProfiles(nextProfiles);
  };

  const createModelProfile = async (payload: {
    provider: string;
    model: string;
    apiBase?: string;
    apiKey?: string;
    qualityRank: number;
    enabled: boolean;
  }) => {
    await api.createModelProfile(payload);
    const nextProfiles = await api.listModelProfiles();
    setProfiles(nextProfiles);
  };

  const testModelProfile = async (profileId: string) => {
    const result = await api.checkModelProfile(profileId);
    return {
      available: result.available,
      reason: result.reason,
      httpStatus: result.httpStatus,
      latencyMs: result.latencyMs
    };
  };

  if (!currentDiagram) {
    return (
      <div className="page">
        <button type="button" onClick={onBack}>
          返回列表
        </button>
        <div className="empty-tip">未选择图表</div>
      </div>
    );
  }

  return (
    <section className="editor-page">
      <header className="editor-header">
        <button type="button" onClick={onBack}>
          返回
        </button>
        <input
          className="title-input"
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          placeholder="图表标题"
          aria-label="图表标题"
        />
        <div className="row-actions">
          <label className="field-inline" htmlFor="engine-select">
            引擎
            <select
              id="engine-select"
              value={engineDraft}
              onChange={(event) => {
                const nextEngine = event.target.value as DiagramEngineType;
                setEngineDraft(nextEngine);
                setDiagram({
                  ...currentDiagram,
                  engineType: nextEngine
                });
              }}
            >
              <option value="reactflow_elk">React Flow + ELK</option>
              <option value="excalidraw">Excalidraw</option>
            </select>
          </label>
          <button type="button" onClick={undoLocal}>
            撤销本地
          </button>
          <button type="button" onClick={saveDiagram} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
          {hasPreview ? (
            <button type="button" className="primary-btn" onClick={applyPreview} disabled={!canApplyPreview || busy}>
              应用预览
            </button>
          ) : null}
        </div>
      </header>
      {jobError ? <div className="error-banner">{jobError}</div> : null}

      <div className="editor-layout">
        <div className="left-column">
          <AiPanel onRunText={handleRunText} onRunImage={handleRunImage} onRunDocument={handleRunDocument} onRunChat={handleRunChat} />
          <ReasoningPanel summary={reasoningSummary} onAskFollowup={handleRunChat} />
          <ModelSettingsPanel
            profiles={profiles}
            onSetDefault={setDefaultModel}
            onCreateProfile={createModelProfile}
            onTestProfile={testModelProfile}
          />
        </div>

        <div className="center-column">
          {engineDraft === "reactflow_elk" ? (
            <ReactFlowCanvas
              elements={hasPreview ? (previewElements ?? []) : elements}
              selection={selection}
              readOnly={hasPreview}
              onSelect={(ids: string[]) => setSelection(ids)}
              onElementsChange={(nextElements) => {
                if (!hasPreview) {
                  setElements(nextElements);
                }
              }}
            />
          ) : (
            <DiagramCanvas
              elements={hasPreview ? (previewElements ?? []) : elements}
              selection={selection}
              readOnly={hasPreview}
              onSelect={(ids: string[]) => setSelection(ids)}
              onElementsChange={(nextElements) => {
                if (!hasPreview) {
                  setElements(nextElements);
                }
              }}
            />
          )}
        </div>

        <div className="right-column">
          <TemplateIconPanel templates={templates} icons={icons} onApplyTemplate={applyTemplate} />
        </div>
      </div>
    </section>
  );
}
