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
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const resetCreateForm = () => {
    setProvider("openai");
    setModel("");
    setApiBase("");
    setApiKey("");
    setQualityRank(5);
    setEnabled(true);
    setShowKey(false);
    setError(null);
  };

  const openCreateModal = () => {
    resetCreateForm();
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (submitting) {
      return;
    }
    setShowCreateModal(false);
    setError(null);
  };

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
      setShowCreateModal(false);
      resetCreateForm();
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
    <section className="model-settings-wrap">
      <div className="model-settings-action-card">
        <div>
          <div className="model-settings-title">模型设置</div>
          <div className="model-settings-subtitle">
            {defaultProfile ? `当前默认：${defaultProfile.provider}/${defaultProfile.model}` : "当前未设置默认模型"}
          </div>
        </div>
        <button type="button" className="primary-btn model-settings-trigger" onClick={openCreateModal}>
          模型设置
        </button>
      </div>

      {showCreateModal ? (
        <div className="modal-overlay" role="presentation" onClick={closeCreateModal}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="新增模型" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h4>新增模型配置</h4>
              <button type="button" onClick={closeCreateModal} disabled={submitting}>
                关闭
              </button>
            </div>

            <div className="model-form model-form-modal">
              <label className="field-label">
                Provider
                <input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="openai / anthropic / custom" />
              </label>
              <label className="field-label">
                Model
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="gpt-4.1 / claude-3-7-sonnet / your-model"
                />
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
              {error ? <div className="error-inline">{error}</div> : null}
              <div className="row-actions">
                <button type="button" onClick={closeCreateModal} disabled={submitting}>
                  取消
                </button>
                <button type="button" className="primary-btn" onClick={submit} disabled={submitting}>
                  {submitting ? "创建中..." : "保存模型"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="model-settings-cards-card">
        <div className="model-settings-cards-header">已配置模型</div>
        {profiles.length ? (
          <ul className="model-cards">
            {profiles.map((profile) => (
              <li key={profile.id} className="model-card">
                <div className="model-card-head">
                  <div>
                    <strong>
                      {profile.provider}/{profile.model}
                    </strong>
                  </div>
                  <div className="model-badges">
                    <span className={`chip ${profile.enabled ? "chip-ok" : "chip-off"}`}>{profile.enabled ? "Enabled" : "Disabled"}</span>
                    {profile.isDefault ? <span className="chip chip-default">Default</span> : null}
                  </div>
                </div>

                <div className="model-card-meta">Rank: {profile.qualityRank}</div>
                <div className="model-card-meta">{profile.hasApiKey ? `Key: ${profile.apiKeyPreview}` : "Key: 未配置"}</div>
                {profile.apiBase ? <div className="model-card-meta">Base: {profile.apiBase}</div> : null}

                {testResults[profile.id] ? (
                  <div className="model-card-test">
                    测试: {testResults[profile.id].available ? "通过" : "失败"} / {testResults[profile.id].reason} / {testResults[profile.id].latencyMs}
                    ms
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
        ) : (
          <div className="empty-tip">暂无模型配置，请点击上方“模型设置”按钮进行添加。</div>
        )}
      </div>
    </section>
  );
}
