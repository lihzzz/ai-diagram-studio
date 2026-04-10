import { useState } from "react";

type StyleTemplateDto = {
  id: string;
  name: string;
  category: string;
  diagramType: "flowchart" | "module_architecture";
  isBuiltin: boolean;
  stylePrompt: string | null;
  renderConfig: Record<string, unknown> | null;
  previewImageUrl: string | null;
  createdAt: string;
};

type SidebarProps = {
  templates: StyleTemplateDto[];
  activeTemplateId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function Sidebar({
  templates,
  activeTemplateId,
  onSelect,
  onCreate,
  onDelete
}: SidebarProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onCreate(file);
    } finally {
      setUploading(false);
    }
    event.target.value = "";
  };

  const builtin = templates.filter((t) => t.isBuiltin);
  const custom = templates.filter((t) => !t.isBuiltin);

  const renderTemplate = (tpl: StyleTemplateDto) => {
    const isActive = activeTemplateId === tpl.id;
    return (
      <div
        key={tpl.id}
        className={`sidebar-item ${isActive ? "active" : ""}`}
        onClick={() => onSelect(isActive ? null : tpl.id)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontWeight: 500, fontSize: 13 }}>{tpl.name}</span>
            {tpl.isBuiltin && <span className="sidebar-tpl-builtin">内置</span>}
          </div>
          {tpl.previewImageUrl && (
            <img className="sidebar-tpl-preview-img" src={tpl.previewImageUrl} alt={tpl.name} />
          )}
        </div>
        {!tpl.isBuiltin && (
          <button
            className="sidebar-tpl-delete"
            onClick={(e) => { e.stopPropagation(); void onDelete(tpl.id); }}
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="sidebar-inner">
      {/* TEMPLATES section */}
      <div className="sidebar-section-title">TEMPLATES</div>
      <div className="sidebar-list">
        {builtin.map(renderTemplate)}
        {builtin.length > 0 && custom.length > 0 && (
          <div className="sidebar-section-divider" />
        )}
        {custom.map(renderTemplate)}
        {templates.length === 0 && (
          <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--ink-dim)" }}>
            暂无风格模板
          </div>
        )}
      </div>
      <label className="sidebar-upload-btn">
        <input type="file" accept=".json,application/json" onChange={handleUpload} disabled={uploading} />
        {uploading ? "导入中..." : "+ 导入 JSON"}
      </label>

      {/* NODE TYPES legend */}
      <div className="sidebar-section-title">NODE TYPES</div>
      <div className="node-type-legend">
        <div className="legend-item">
          <span className="legend-dot legend-dot--green" /> Start / End
        </div>
        <div className="legend-item">
          <span className="legend-dot legend-dot--purple" /> Process
        </div>
        <div className="legend-item">
          <span className="legend-diamond legend-diamond--yellow" /> Decision
        </div>
        <div className="legend-item">
          <span className="legend-line legend-line--dashed" /> Conditional Edge
        </div>
        <div className="legend-item">
          <span className="legend-line legend-line--solid" /> Direct Edge
        </div>
      </div>
    </div>
  );
}
