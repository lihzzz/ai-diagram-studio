import { Component, type ReactNode, useEffect, useMemo, useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";

import type { DiagramElement } from "../types";
import { fromExcalidrawElements, toExcalidrawElements } from "../utils/excalidraw-adapter";

type ExcalidrawElementLike = {
  id: string;
  type: string;
  isDeleted?: boolean;
};

type ExcalidrawAppStateLike = {
  selectedElementIds?: Record<string, boolean>;
};

type ExcalidrawApiLike = {
  updateScene: (scene: { elements?: readonly ExcalidrawElementLike[] }) => void;
  scrollToContent?: (target?: readonly ExcalidrawElementLike[]) => void;
};

type DiagramCanvasProps = {
  elements: DiagramElement[];
  selection: string[];
  readOnly?: boolean;
  onSelect: (ids: string[]) => void;
  onElementsChange?: (elements: DiagramElement[]) => void;
};

type CanvasErrorBoundaryState = {
  error: string | null;
};

class CanvasErrorBoundary extends Component<{ children: ReactNode }, CanvasErrorBoundaryState> {
  state: CanvasErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return <div className="error-inline">画布渲染失败: {this.state.error}</div>;
    }
    return this.props.children;
  }
}

function sortObjectKeys(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  const sortedKeys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = value[key];
  }
  return result;
}

function elementSignature(elements: DiagramElement[]): string {
  const normalized = [...elements]
    .map((item) => ({
      id: item.id,
      type: item.type,
      x: Math.round(item.x),
      y: Math.round(item.y),
      width: item.width ?? null,
      height: item.height ?? null,
      text: item.text ?? null,
      groupId: item.groupId ?? null,
      meta: sortObjectKeys(item.meta)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalized);
}

export function DiagramCanvas({ elements, selection, readOnly = false, onSelect, onElementsChange }: DiagramCanvasProps) {
  const excalidrawElements = useMemo(() => toExcalidrawElements(elements), [elements]);
  const apiRef = useRef<ExcalidrawApiLike | null>(null);
  const syncingSceneRef = useRef(false);
  const lastAppliedSignatureRef = useRef<string>("");
  const selectionRef = useRef<string[]>([]);
  const incomingElementsRef = useRef(elements);
  const incomingSignature = useMemo(() => elementSignature(elements), [elements]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    incomingElementsRef.current = elements;
  }, [elements]);

  const syncScene = (nextElements: readonly ExcalidrawElementLike[], signature: string) => {
    if (!apiRef.current) {
      return;
    }
    syncingSceneRef.current = true;
    apiRef.current.updateScene({ elements: nextElements });
    apiRef.current.scrollToContent?.(nextElements.filter((item) => !item.isDeleted));
    lastAppliedSignatureRef.current = signature;
    const timer = window.setTimeout(() => {
      syncingSceneRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  };

  useEffect(() => {
    if (!apiRef.current) {
      return;
    }
    if (lastAppliedSignatureRef.current === incomingSignature) {
      return;
    }
    return syncScene(excalidrawElements as unknown as readonly ExcalidrawElementLike[], incomingSignature);
  }, [excalidrawElements, incomingSignature]);

  // 组件挂载时强制同步一次，处理重新挂载后数据已存在的情况
  useEffect(() => {
    if (!apiRef.current) {
      return;
    }
    const currentElements = incomingElementsRef.current;
    const signature = elementSignature(currentElements);
    if (lastAppliedSignatureRef.current !== signature) {
      const excalElements = toExcalidrawElements(currentElements) as unknown as readonly ExcalidrawElementLike[];
      syncScene(excalElements, signature);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="canvas">
      <div className="canvas-toolbar">Canvas (Excalidraw)</div>
      <div className="excalidraw-host">
        <CanvasErrorBoundary>
          <Excalidraw
            excalidrawAPI={(nextApi) => {
              apiRef.current = nextApi as unknown as ExcalidrawApiLike;
              // 使用最新的 elements，而不是闭包中捕获的旧值
              const latestElements = incomingElementsRef.current;
              const initialElements = toExcalidrawElements(latestElements) as unknown as readonly ExcalidrawElementLike[];
              const signature = elementSignature(latestElements);
              if (lastAppliedSignatureRef.current !== signature) {
                syncScene(initialElements, signature);
              }
            }}
            initialData={{
              elements: excalidrawElements as unknown as any[],
              appState: {
                theme: "dark"
              }
            }}
            theme="dark"
            viewModeEnabled={readOnly}
            onChange={(nextElements: readonly ExcalidrawElementLike[], appState: ExcalidrawAppStateLike) => {
              if (syncingSceneRef.current) {
                return;
              }
              const textIdSet = new Set(nextElements.filter((item) => item.type === "text").map((item) => item.id));
              const selected = Object.entries(appState.selectedElementIds ?? {})
                .filter(([, checked]) => checked)
                .map(([id]) => id)
                .filter((id) => !textIdSet.has(id))
                .sort((a, b) => a.localeCompare(b));
              const prevSelected = [...selectionRef.current].sort((a, b) => a.localeCompare(b));
              const sameSelection =
                selected.length === prevSelected.length && selected.every((value, index) => value === prevSelected[index]);
              if (!sameSelection) {
                selectionRef.current = selected;
                onSelect(selected);
              }

              if (!readOnly && onElementsChange) {
                const normalized = fromExcalidrawElements(nextElements as unknown as readonly unknown[]);
                const activeSceneCount = nextElements.filter((item) => !item.isDeleted).length;
                if (normalized.length === 0 && incomingElementsRef.current.length > 0 && activeSceneCount === 0) {
                  return;
                }
                const nextSignature = elementSignature(normalized);
                if (nextSignature === incomingSignature) {
                  return;
                }
                lastAppliedSignatureRef.current = nextSignature;
                onElementsChange(normalized);
              }
            }}
          />
        </CanvasErrorBoundary>
      </div>
    </div>
  );
}
