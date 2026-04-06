import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

type ReasoningPanelProps = {
  summary: Record<string, unknown> | null;
  onAskFollowup: (instruction: string) => Promise<void>;
};

function summaryToMarkdown(summary: Record<string, unknown>): string {
  const lines = ["### Reasoning Summary"];
  for (const [key, value] of Object.entries(summary)) {
    if (Array.isArray(value)) {
      lines.push(`- **${key}**: ${value.join(" / ")}`);
    } else {
      lines.push(`- **${key}**: ${String(value)}`);
    }
  }
  return lines.join("\n");
}

export function ReasoningPanel({ summary, onAskFollowup }: ReasoningPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [followup, setFollowup] = useState("基于摘要继续优化");
  const markdown = useMemo(() => (summary ? summaryToMarkdown(summary) : ""), [summary]);

  const copySummary = async () => {
    if (!summary) {
      return;
    }
    await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
  };

  return (
    <section className="panel">
      <header className="panel-header">
        推理摘要
        <div className="row-actions">
          <button type="button" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "展开" : "折叠"}
          </button>
          <button type="button" onClick={copySummary}>
            复制
          </button>
        </div>
      </header>
      {!collapsed && summary ? (
        <>
          <div className="markdown-view">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
          <div className="followup-row">
            <input value={followup} onChange={(event) => setFollowup(event.target.value)} />
            <button type="button" onClick={() => onAskFollowup(followup)}>
              继续追问
            </button>
          </div>
        </>
      ) : null}
      {!summary ? <div className="empty-tip">暂无摘要</div> : null}
    </section>
  );
}
