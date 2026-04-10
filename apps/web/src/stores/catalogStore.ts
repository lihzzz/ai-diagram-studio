import { create } from "zustand";
import type { StyleTemplateDto } from "../api/client";

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
  styleTemplates: StyleTemplateDto[];
  activeStyleTemplateId: string | null;
  setTemplates: (templates: TemplateRecord[]) => void;
  setIcons: (icons: IconRecord[]) => void;
  setStyleTemplates: (styleTemplates: StyleTemplateDto[]) => void;
  setActiveStyleTemplateId: (templateId: string | null) => void;
};

export const useCatalogStore = create<CatalogState>((set) => ({
  templates: [],
  icons: [],
  styleTemplates: [],
  activeStyleTemplateId: null,
  setTemplates: (templates) => set({ templates }),
  setIcons: (icons) => set({ icons }),
  setStyleTemplates: (styleTemplates) => set({ styleTemplates }),
  setActiveStyleTemplateId: (activeStyleTemplateId) => set({ activeStyleTemplateId })
}));
