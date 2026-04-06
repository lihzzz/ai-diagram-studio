type ChangeSet = {
  id: string;
  summary: string | null;
  beforeRevisionId: string;
  afterRevisionId: string;
  createdAt: string;
};

type DiffPanelProps = {
  revisions: Array<{ id: string; version: number; note: string | null; createdAt: string }>;
  changeSets: ChangeSet[];
  onRestoreRevision: (version: number) => Promise<void>;
  onRevertChangeSet: (id: string) => Promise<void>;
};

export function DiffPanel({ revisions, changeSets, onRestoreRevision, onRevertChangeSet }: DiffPanelProps) {
  return (
    <section className="panel">
      <header className="panel-header">版本与差异</header>
      <div className="split-panel">
        <div>
          <h4>Revisions</h4>
          <ul className="list">
            {revisions.map((item) => (
              <li key={item.id}>
                <div className="list-main">
                  <span>v{item.version}</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
                <div className="list-sub">{item.note ?? "-"}</div>
                <button type="button" onClick={() => onRestoreRevision(item.version)}>
                  恢复
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>ChangeSets</h4>
          <ul className="list">
            {changeSets.map((item) => (
              <li key={item.id}>
                <div className="list-main">
                  <span>{item.id.slice(0, 12)}</span>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
                <div className="list-sub">{item.summary ?? "-"}</div>
                <button type="button" onClick={() => onRevertChangeSet(item.id)}>
                  回滚
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
