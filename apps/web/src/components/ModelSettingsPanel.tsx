import { useMemo, useState } from "react";

type ModelSettingsPanelProps = {
  profiles: Array<{
    id: string;
    provider: string;
    model: string;
    apiBase: string | null;
    qualityRank: number;
    isDefault: boolean;
    enabled: boolean;
    hasApiKey: boolean;
    apiKeyPreview: string | null;
  }>;
  onSetDefault: (modelProfileId: string) => Promise<void>;
  onCreateProfile: (payload: {
    provider: string;
    model: string;
    apiBase?: string;
    apiKey?: string;
    qualityRank: number;
    enabled: boolean;
  }) => Promise<void>;
  onTestProfile: (profileId: string) => Promise<{
    available: boolean;
    reason: string;
    httpStatus: number | null;
    latencyMs: number;
  }>;
};

export function ModelSettingsPanel({ profiles, onSetDefault, onCreateProfile, onTestProfile }: ModelSettingsPanelProps) {
  const defaultProfile = useMemo(() => profiles.find((item) => item.isDefault), [profiles]);
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [qualityRank, setQualityRank] = useState(5);
  const [enabled, setEnabled] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { available: boolean; reason: string; httpStatus: number | null; latencyMs: number }>
  >({});

  const submit = async () => {
    if (!provider.trim() || !model.trim()) {
      setError("provider 和 model 必填");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreateProfile({
        provider: provider.trim(),
        model: model.trim(),
        apiBase: apiBase.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        qualityRank,
        enabled
      });
      setModel("");
      setApiBase("");
      setApiKey("");
      setQualityRank(5);
      setEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const testProfile = async (profileId: string) => {
    setTestingId(profileId);
    try {
      const result = await onTestProfile(profileId);
      setTestResults((state) => ({
        ...state,
        [profileId]: result
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <section className="panel">
      <header className="panel-header">
        模型设置
        {defaultProfile ? <span className="badge">Default: {defaultProfile.provider}</span> : null}
      </header>

      <div className="model-form">
        <label className="field-label">
          Provider
          <input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="openai / anthropic / custom" />
        </label>
        <label className="field-label">
          Model
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4.1 / claude-3-7-sonnet / your-model" />
        </label>
        <label className="field-label">
          API Base (可选)
          <input
            value={apiBase}
            onChange={(event) => setApiBase(event.target.value)}
            placeholder="https://your-openai-compatible-endpoint/v1"
          />
        </label>
        <label className="field-label">
          API Key
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
          />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showKey} onChange={(event) => setShowKey(event.target.checked)} />
          <span>显示 API Key</span>
        </label>
        <label className="field-label">
          Quality Rank (1-100)
          <input
            type="number"
            min={1}
            max={100}
            value={qualityRank}
            onChange={(event) => setQualityRank(Number(event.target.value) || 1)}
          />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>启用该模型</span>
        </label>
        <button type="button" className="primary-btn" onClick={submit} disabled={submitting}>
          {submitting ? "创建中..." : "新增自定义模型"}
        </button>
        {error ? <div className="error-inline">{error}</div> : null}
      </div>

      <ul className="list">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <div className="list-main">
              <span>
                {profile.provider}/{profile.model}
              </span>
              <small>{profile.enabled ? "enabled" : "disabled"}</small>
            </div>
            <div className="list-sub">
              {profile.hasApiKey ? `key: ${profile.apiKeyPreview}` : "key: 未配置"}
              {profile.apiBase ? ` / base: ${profile.apiBase}` : ""}
            </div>
            {testResults[profile.id] ? (
              <div className="list-sub">
                测试: {testResults[profile.id].available ? "通过" : "失败"} / {testResults[profile.id].reason} /{" "}
                {testResults[profile.id].latencyMs}ms
                {testResults[profile.id].httpStatus ? ` / HTTP ${testResults[profile.id].httpStatus}` : ""}
              </div>
            ) : null}
            <div className="row-actions">
              <button type="button" disabled={profile.isDefault} onClick={() => onSetDefault(profile.id)}>
                {profile.isDefault ? "当前默认" : "设为默认"}
              </button>
              <button type="button" onClick={() => testProfile(profile.id)} disabled={testingId === profile.id}>
                {testingId === profile.id ? "测试中..." : "测试"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
