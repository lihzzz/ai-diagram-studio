import { useState } from "react";

const CHIP_SUGGESTIONS = [
  "User Auth Flow",
  "E-commerce Checkout",
  "CI/CD Pipeline",
  "ML Training Loop"
];

type BottomBarProps = {
  onGenerate: (inputText: string, diagramType: "flowchart" | "module_architecture") => Promise<void>;
  running: boolean;
  hasExistingDiagram?: boolean;
};

export function BottomBar({ onGenerate, running, hasExistingDiagram }: BottomBarProps) {
  const [input, setInput] = useState("");
  const [diagramType, setDiagramType] = useState<"flowchart" | "module_architecture">("flowchart");

  const handleChipClick = (chip: string) => {
    setInput((prev) => prev ? prev + "\n" + chip : chip + "\n");
  };

  const handleGenerate = async () => {
    if (!input.trim() || running) return;
    await onGenerate(input, diagramType);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleGenerate();
    }
  };

  return (
    <div className="bottom-bar">
      <div className="bottom-chips">
        {CHIP_SUGGESTIONS.map((chip) => (
          <button
            key={chip}
            className="bottom-chip"
            type="button"
            onClick={() => handleChipClick(chip)}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="bottom-input-row">
        <div className="diagram-type-toggle">
          <button
            type="button"
            className={diagramType === "flowchart" ? "active" : ""}
            onClick={() => setDiagramType("flowchart")}
          >
            流程图
          </button>
          <button
            type="button"
            className={diagramType === "module_architecture" ? "active" : ""}
            onClick={() => setDiagramType("module_architecture")}
          >
            架构图
          </button>
        </div>
        <div className="bottom-input-wrap">
          <span className="wand-icon">✦</span>
          <input
            className="bottom-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasExistingDiagram ? "描述要优化的地方，例如：新增支付模块" : "Describe the diagram you want to create..."}
          />
        </div>
        <button
          className="bottom-generate-btn"
          type="button"
          onClick={handleGenerate}
          disabled={running || !input.trim()}
        >
          {running ? "生成中..." : hasExistingDiagram ? "继续优化" : "Generate"}
        </button>
      </div>
    </div>
  );
}
