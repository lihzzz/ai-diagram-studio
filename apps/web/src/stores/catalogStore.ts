import { create } from "zustand";

type TemplateRecord = {
  id: string;
  name: string;
  category: string;
  diagramType: string;
  isBuiltin: boolean;
};

type IconRecord = {
  id: string;
  name: string;
  category: string;
  source: string;
};

type CatalogState = {
  templates: TemplateRecord[];
  icons: IconRecord[];
  setTemplates: (templates: TemplateRecord[]) => void;
  setIcons: (icons: IconRecord[]) => void;
};

export const useCatalogStore = create<CatalogState>((set) => ({
  templates: [],
  icons: [],
  setTemplates: (templates) => set({ templates }),
  setIcons: (icons) => set({ icons })
}));
