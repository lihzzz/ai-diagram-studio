import { useState } from "react";
import { DEFAULT_RENDER_CONFIG } from "@ai-diagram-studio/shared";

import type { StyleTemplateDto } from "../api/client";

type TemplateIconPanelProps = {
  styleTemplates: StyleTemplateDto[];
  activeStyleTemplateId: string | null;
  onSelectStyleTemplate: (templateId: string | null) => void;
  onUploadStyleTemplate: (file: File, name?: string) => Promise<void>;
  onAnalyzeStyleTemplate: (templateId: string) => Promise<void>;
  onDeleteStyleTemplate: (templateId: string) => Promise<void>;
  styleTemplatePreviewUrl: (templateId: string) => string;
};

export function TemplateIconPanel({
  styleTemplates,
  activeStyleTemplateId,
  onSelectStyleTemplate,
  onUploadStyleTemplate,
  onAnalyzeStyleTemplate,
  onDeleteStyleTemplate,
  styleTemplatePreviewUrl
}: TemplateIconPanelProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File | null) => {
    if (!file || uploading) {
      return;
    }
    setUploading(true);
    try {
      await onUploadStyleTemplate(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel-header">风格模板库</header>

      <label className="style-tpl-upload">
        <span>{uploading ? "上传中..." : "上传图片创建模板"}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => {
            void handleUpload(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>

      <div className="style-tpl-list">
        {styleTemplates.map((template) => {
          const active = activeStyleTemplateId === template.id;
          const renderConfig = template.renderConfig ?? DEFAULT_RENDER_CONFIG;
          return (
            <div key={template.id} className={`style-tpl-item ${active ? "active" : ""}`}>
              <button
                type="button"
                className="style-tpl-main"
                onClick={() => onSelectStyleTemplate(active ? null : template.id)}
              >
                <div className="style-tpl-name-row">
                  <span>{template.name}</span>
                  {template.isBuiltin ? <small>内置</small> : null}
                </div>
                <div className="style-tpl-palette">
                  {Object.entries(renderConfig.groupColors)
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <span key={key} title={key} style={{ background: value }} />
                    ))}
                </div>
                {template.hasPreview ? (
                  <img
                    className="style-tpl-preview-img"
                    src={styleTemplatePreviewUrl(template.id)}
                    alt={`${template.name} 预览`}
                  />
                ) : null}
              </button>
              <div className="style-tpl-actions">
                <button
                  type="button"
                  className="style-tpl-action-btn"
                  onClick={() => {
                    void onAnalyzeStyleTemplate(template.id);
                  }}
                >
                  AI 分析
                </button>
                {!template.isBuiltin ? (
                  <button
                    type="button"
                    className="style-tpl-action-btn danger"
                    onClick={() => {
                      void onDeleteStyleTemplate(template.id);
                    }}
                  >
                    删除
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        {styleTemplates.length === 0 ? <div className="empty-tip">暂无模板</div> : null}
      </div>
    </section>
  );
}
