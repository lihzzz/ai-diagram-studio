import { create } from "zustand";

import type { DiagramElement } from "../types";

type JobState = {
  activeJobId: string | null;
  status: "idle" | "pending" | "running" | "succeeded" | "failed";
  progress: number;
  previewElements: DiagramElement[] | null;
  reasoningSummary: Record<string, unknown> | null;
  error: string | null;
  setRunning: (jobId: string) => void;
  setResult: (payload: {
    status: "pending" | "running" | "succeeded" | "failed";
    progress: number;
    previewElements: DiagramElement[] | null;
    reasoningSummary: Record<string, unknown> | null;
    error: string | null;
  }) => void;
  reset: () => void;
};

export const useJobStore = create<JobState>((set) => ({
  activeJobId: null,
  status: "idle",
  progress: 0,
  previewElements: null,
  reasoningSummary: null,
  error: null,
  setRunning: (jobId) =>
    set({
      activeJobId: jobId,
      status: "pending",
      progress: 0,
      previewElements: null,
      reasoningSummary: null,
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
  reset: () =>
    set({
      activeJobId: null,
      status: "idle",
      progress: 0,
      previewElements: null,
      reasoningSummary: null,
      error: null
    })
}));
