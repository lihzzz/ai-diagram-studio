import { useState } from "react";

type AiPanelProps = {
  onRunText: (inputText: string, diagramType: "flowchart" | "module_architecture") => Promise<void>;
  hasExistingDiagram?: boolean;
};

export function AiPanel({ onRunText, hasExistingDiagram = false }: AiPanelProps) {
  const [inputText, setInputText] = useState("");
  const [diagramType, setDiagramType] = useState<"flowchart" | "module_architecture">("flowchart");
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (running || !inputText.trim()) {
      return;
    }
    setRunning(true);
    try {
      await onRunText(inputText, diagramType);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel-header">AI 面板</header>

      <label className="field-label">
        图类型
        <select value={diagramType} onChange={(event) => setDiagramType(event.target.value as "flowchart" | "module_architecture")}>
          <option value="flowchart">流程图</option>
          <option value="module_architecture">模块架构图</option>
        </select>
      </label>

      <textarea
        className="input-area"
        value={inputText}
        placeholder={hasExistingDiagram ? "描述要优化的地方，例如：把支付和风控拆成两个步骤" : "输入流程描述或模块描述，每行一个步骤/模块"}
        onChange={(event) => setInputText(event.target.value)}
      />

      <button className="primary-btn" type="button" onClick={handleRun} disabled={running || !inputText.trim()}>
        {running ? "运行中..." : hasExistingDiagram ? "继续优化" : "开始生成"}
      </button>
    </section>
  );
}
