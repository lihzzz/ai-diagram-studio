type TemplateIconPanelProps = {
  templates: Array<{ id: string; name: string; category: string; diagramType: string }>;
  icons: Array<{ id: string; name: string; category: string; source: string }>;
  onApplyTemplate: (templateId: string) => Promise<void>;
};

export function TemplateIconPanel({ templates, icons, onApplyTemplate }: TemplateIconPanelProps) {
  return (
    <section className="panel">
      <header className="panel-header">模板与图标库</header>

      <div className="split-panel">
        <div>
          <h4>模板</h4>
          <ul className="list">
            {templates.map((template) => (
              <li key={template.id}>
                <div className="list-main">
                  <span>{template.name}</span>
                  <small>{template.category}</small>
                </div>
                <button type="button" onClick={() => onApplyTemplate(template.id)}>
                  应用
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>图标</h4>
          <ul className="list">
            {icons.map((icon) => (
              <li key={icon.id}>
                <div className="list-main">
                  <span>{icon.name}</span>
                  <small>
                    {icon.category}/{icon.source}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
