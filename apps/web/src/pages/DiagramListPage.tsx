import { useState } from "react";

import type { DiagramRecord } from "../types";

type DiagramListPageProps = {
  diagrams: DiagramRecord[];
  onOpenDiagram: (id: string) => Promise<void>;
  onCreateDiagram: (title: string, type: "flowchart" | "module_architecture") => Promise<void>;
};

export function DiagramListPage({ diagrams, onOpenDiagram, onCreateDiagram }: DiagramListPageProps) {
  const [title, setTitle] = useState("新建图表");
  const [type, setType] = useState<"flowchart" | "module_architecture">("flowchart");

  return (
    <section className="page">
      <div className="hero">
        <h1>AI Diagram Studio</h1>
        <p>文本/图片/文档生成 + 对话式增量改图 + 快照差异 + 模型切换</p>
      </div>

      <div className="create-row">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="图表标题" />
        <select value={type} onChange={(event) => setType(event.target.value as "flowchart" | "module_architecture")}>
          <option value="flowchart">流程图</option>
          <option value="module_architecture">模块架构图</option>
        </select>
        <button type="button" onClick={() => onCreateDiagram(title, type)}>
          新建
        </button>
      </div>

      <ul className="cards">
        {diagrams.map((diagram) => (
          <li key={diagram.id} className="card">
            <div>
              <h3>{diagram.title}</h3>
              <p>
                {diagram.type}
              </p>
            </div>
            <button type="button" onClick={() => onOpenDiagram(diagram.id)}>
              打开
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
