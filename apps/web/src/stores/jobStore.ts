import { create } from "zustand";

import type { DiagramElement, GenerationJobSummary } from "../types";

export type Snapshot = {
  elements: DiagramElement[];
  reasoningSummary: Record<string, unknown> | null;
};

type JobState = {
  activeJobId: string | null;
  status: "idle" | "pending" | "running" | "succeeded" | "failed";
  progress: number;
  previewElements: DiagramElement[] | null;
  reasoningSummary: Record<string, unknown> | null;
  error: string | null;
  history: GenerationJobSummary[];
  lastInputText: string;
  undoStack: Snapshot[];
  setRunning: (jobId: string) => void;
  setResult: (payload: {
    status: "pending" | "running" | "succeeded" | "failed";
    progress: number;
    previewElements: DiagramElement[] | null;
    reasoningSummary: Record<string, unknown> | null;
    error: string | null;
  }) => void;
  setHistory: (history: GenerationJobSummary[]) => void;
  setLastInputText: (text: string) => void;
  pushSnapshot: (snapshot: Snapshot) => void;
  popSnapshot: () => Snapshot | null;
  clearAll: () => void;
  reset: () => void;
};

export const useJobStore = create<JobState>((set, get) => ({
  activeJobId: null,
  status: "idle",
  progress: 0,
  previewElements: null,
  reasoningSummary: null,
  error: null,
  history: [],
  lastInputText: "",
  undoStack: [],
  setRunning: (jobId) =>
    set({
      activeJobId: jobId,
      status: "pending",
      progress: 0,
      previewElements: null,
      error: null
    }),
  setResult: (payload) =>
    set({
      status: payload.status,
      progress: payload.progress,
      previewElements: payload.previewElements,
      reasoningSummary: payload.reasoningSummary,
      error: payload.error
    }),
  setHistory: (history) => set({ history }),
  setLastInputText: (lastInputText) => set({ lastInputText }),
  pushSnapshot: (snapshot) =>
    set((state) => {
      const next = [...state.undoStack, snapshot];
      return {
        undoStack: next.slice(Math.max(0, next.length - 10))
      };
    }),
  popSnapshot: () => {
    const stack = get().undoStack;
    if (stack.length === 0) {
      return null;
    }
    const item = stack[stack.length - 1];
    set({ undoStack: stack.slice(0, -1) });
    return item;
  },
  clearAll: () =>
    set({
      activeJobId: null,
      status: "idle",
      progress: 0,
      previewElements: null,
      reasoningSummary: null,
      error: null,
      history: [],
      lastInputText: "",
      undoStack: []
    }),
  reset: () =>
    set({
      activeJobId: null,
      status: "idle",
      progress: 0,
      previewElements: null,
      error: null
    })
}));
