import { useEffect, useState } from "react";

import { api } from "./api/client";
import { EditorPage } from "./pages/EditorPage";
import { DiagramListPage } from "./pages/DiagramListPage";
import { useEditorStore } from "./stores/editorStore";
import type { DiagramRecord } from "./types";

export function App() {
  const { setDiagram, currentDiagram } = useEditorStore();
  const [diagrams, setDiagrams] = useState<DiagramRecord[]>([]);
  const [page, setPage] = useState<"list" | "editor">("list");
  const [error, setError] = useState<string | null>(null);

  const loadDiagrams = async () => {
    try {
      const items = await api.listDiagrams();
      setDiagrams(items);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "load diagrams failed";
      setError(message);
    }
  };

  useEffect(() => {
    void loadDiagrams();
  }, []);

  const openDiagram = async (id: string) => {
    try {
      const diagram = await api.getDiagram(id);
      setDiagram(diagram);
      setPage("editor");
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "open diagram failed";
      setError(message);
    }
  };

  const createDiagram = async (title: string, type: "flowchart" | "module_architecture") => {
    const created = await api.createDiagram({ title, type });
    await loadDiagrams();
    setDiagram(created);
    setPage("editor");
  };

  if (page === "editor") {
    return (
      <div className="app-shell">
        {error ? <div className="error-banner">{error}</div> : null}
        <EditorPage
          onBack={() => {
            setPage("list");
            void loadDiagrams();
          }}
          onDiagramUpdate={(updated: DiagramRecord) => {
            setDiagram(updated);
            setDiagrams((state) => state.map((item) => (item.id === updated.id ? updated : item)));
          }}
        />
      </div>
    );
  }

  return (
    <>
      {error ? <div className="error-banner" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>{error}</div> : null}
      <DiagramListPage diagrams={diagrams} onOpenDiagram={openDiagram} onCreateDiagram={createDiagram} />
      {currentDiagram ? (
        <button
          className="floating-open"
          type="button"
          onClick={() => {
            setPage("editor");
          }}
        >
          回到编辑器
        </button>
      ) : null}
    </>
  );
}
