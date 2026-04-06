import { create } from "zustand";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChatState = {
  sessionId: string | null;
  turns: ChatTurn[];
  pendingInstruction: string;
  setSessionId: (sessionId: string) => void;
  addTurn: (turn: ChatTurn) => void;
  setPendingInstruction: (content: string) => void;
  clear: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  sessionId: null,
  turns: [],
  pendingInstruction: "",
  setSessionId: (sessionId) => set({ sessionId }),
  addTurn: (turn) => set((state) => ({ turns: [...state.turns, turn] })),
  setPendingInstruction: (content) => set({ pendingInstruction: content }),
  clear: () => set({ sessionId: null, turns: [], pendingInstruction: "" })
}));
