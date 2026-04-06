import { create } from "zustand";

type ModelProfile = {
  id: string;
  provider: string;
  model: string;
  apiBase: string | null;
  qualityRank: number;
  enabled: boolean;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
};

type ModelState = {
  profiles: ModelProfile[];
  setProfiles: (profiles: ModelProfile[]) => void;
};

export const useModelStore = create<ModelState>((set) => ({
  profiles: [],
  setProfiles: (profiles) => set({ profiles })
}));
