import { create } from "zustand";

import type { DiagramElement, DiagramRecord } from "../types";

type EditorState = {
  currentDiagram: DiagramRecord | null;
  elements: DiagramElement[];
  selection: string[];
  dirty: boolean;
  localHistory: DiagramElement[][];
  canvasEngine: "excalidraw" | "reactflow";
  setDiagram: (diagram: DiagramRecord) => void;
  setElements: (elements: DiagramElement[]) => void;
  setSelection: (selection: string[]) => void;
  pushHistory: () => void;
  undoLocal: () => void;
  setCanvasEngine: (engine: "excalidraw" | "reactflow") => void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  currentDiagram: null,
  elements: [],
  selection: [],
  dirty: false,
  localHistory: [],
  canvasEngine: "reactflow",
  setDiagram: (diagram) =>
    set({
      currentDiagram: diagram,
      elements: diagram.elements,
      selection: [],
      dirty: false,
      localHistory: [diagram.elements]
    }),
  setElements: (elements) => set({ elements, dirty: true }),
  setSelection: (selection) => set({ selection }),
  pushHistory: () =>
    set((state) => ({
      localHistory: [...state.localHistory, get().elements]
    })),
  undoLocal: () =>
    set((state) => {
      if (state.localHistory.length <= 1) {
        return state;
      }
      const nextHistory = state.localHistory.slice(0, -1);
      const last = nextHistory[nextHistory.length - 1];
      return {
        ...state,
        localHistory: nextHistory,
        elements: last,
        dirty: true
      };
    }),
  setCanvasEngine: (engine) => set({ canvasEngine: engine })
}));
