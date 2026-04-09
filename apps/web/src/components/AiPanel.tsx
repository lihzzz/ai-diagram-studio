import { useState } from "react";

type AiPanelProps = {
  onRunText: (inputText: string) => Promise<void>;
  onRunImage: (file: File) => Promise<void>;
  onRunDocument: (file: File, parseFirst: boolean) => Promise<void>;
  onRunChat: (instruction: string) => Promise<void>;
};

const TABS = ["text", "image", "document", "chat"] as const;

export function AiPanel({ onRunText, onRunImage, onRunDocument, onRunChat }: AiPanelProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("text");
  const [inputText, setInputText] = useState("");
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
        await onRunText(inputText);
      }
      if (tab === "image" && file) {
        await onRunImage(file);
      }
      if (tab === "document" && file) {
        await onRunDocument(file, true);
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
