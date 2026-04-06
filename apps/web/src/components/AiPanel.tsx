import { useState } from "react";

type AiPanelProps = {
  onRunText: (inputText: string, diagramType: "flowchart" | "module_architecture") => Promise<void>;
  onRunImage: (file: File, diagramType: "flowchart" | "module_architecture") => Promise<void>;
  onRunDocument: (
    file: File,
    diagramType: "flowchart" | "module_architecture",
    parseFirst: boolean
  ) => Promise<void>;
  onRunChat: (instruction: string) => Promise<void>;
};

const TABS = ["text", "image", "document", "chat"] as const;

export function AiPanel({ onRunText, onRunImage, onRunDocument, onRunChat }: AiPanelProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("text");
  const [inputText, setInputText] = useState("");
  const [diagramType, setDiagramType] = useState<"flowchart" | "module_architecture">("flowchart");
  const [file, setFile] = useState<File | null>(null);
  const [chatInstruction, setChatInstruction] = useState("");
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    if (running) {
      return;
    }
    setRunning(true);
    try {
      if (tab === "text") {
        await onRunText(inputText, diagramType);
      }
      if (tab === "image" && file) {
        await onRunImage(file, diagramType);
      }
      if (tab === "document" && file) {
        await onRunDocument(file, diagramType, true);
      }
      if (tab === "chat") {
        await onRunChat(chatInstruction);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="panel">
      <header className="panel-header">AI 面板</header>
      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item}
            className={`tab-btn ${item === tab ? "active" : ""}`}
            type="button"
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <label className="field-label">
        图类型
        <select value={diagramType} onChange={(event) => setDiagramType(event.target.value as "flowchart" | "module_architecture")}>
          <option value="flowchart">流程图</option>
          <option value="module_architecture">模块架构图</option>
        </select>
      </label>

      {tab === "text" ? (
        <textarea
          className="input-area"
          value={inputText}
          placeholder="输入流程描述或模块描述，每行一个步骤/模块"
          onChange={(event) => setInputText(event.target.value)}
        />
      ) : null}

      {tab === "image" || tab === "document" ? (
        <label className="field-label">
          上传文件
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
      ) : null}

      {tab === "chat" ? (
        <textarea
          className="input-area"
          value={chatInstruction}
          placeholder="输入增量改图指令，例如：新增支付风控模块并连接到订单服务"
          onChange={(event) => setChatInstruction(event.target.value)}
        />
      ) : null}

      <button className="primary-btn" type="button" onClick={handleRun} disabled={running}>
        {running ? "运行中..." : "开始生成"}
      </button>
    </section>
  );
}
