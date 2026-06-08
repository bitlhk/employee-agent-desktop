import { useState, useEffect, useCallback, useRef } from "react";
import { GATEWAY_SECTIONS, GATEWAY_PLATFORMS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import BrandLogo from "../../components/common/BrandLogo";

type PlatformStatus = {
  key: string;
  status: "connected" | "not_connected" | "not_configured" | "unsupported";
  label?: string;
  detail?: string;
};

// ── Enterprise-mode Gateway ──────────────────────────────────────────────────

function statusLabel(status: PlatformStatus["status"]): string {
  if (status === "connected") return "已连接";
  if (status === "not_connected") return "未连接";
  if (status === "unsupported") return "暂未接入";
  return "未配置";
}

function EnterpriseGateway({ remoteUrl }: { remoteUrl: string }): React.JSX.Element {
  const [channels, setChannels] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [unbinding, setUnbinding] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const statuses = await window.hermesAPI.getPlatformStatus();
      setChannels(
        Object.values(statuses).length > 0
          ? Object.values(statuses)
          : [],
      );
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
    pollRef.current = setInterval(() => void loadChannels(), 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadChannels]);

  async function handleUnbind(key: string): Promise<void> {
    setConfirmKey(null);
    setUnbinding(key);
    try {
      const result = await window.hermesAPI.unbindEnterpriseChannel(key);
      if (!result.ok) {
        console.error("unbind failed", result.error);
      }
      await loadChannels();
    } finally {
      setUnbinding(null);
    }
  }

  function handleBind(): void {
    const base = remoteUrl.replace(/\/$/, "");
    void window.hermesAPI.openExternal(`${base}/`);
  }

  return (
    <div className="settings-container">
      <h1 className="settings-header">频道</h1>

      {loading && channels.length === 0 && (
        <div className="settings-section">
          <div className="settings-field-hint">加载中...</div>
        </div>
      )}

      {channels.length > 0 && (
        <div className="settings-section">
          <div className="settings-section-title">绑定状态</div>
          {channels.map((ch) => (
            <div key={ch.key} className="settings-platform-card">
              <div className="settings-platform-header">
                <div className="settings-platform-left">
                  <BrandLogo provider={ch.key} size={28} />
                  <div className="settings-platform-info">
                    <div className="settings-platform-title-row">
                      <span className="settings-platform-label">
                        {ch.label || ch.key}
                      </span>
                      <span className={`settings-platform-status ${ch.status}`}>
                        {statusLabel(ch.status)}
                      </span>
                    </div>
                    {ch.detail && (
                      <span className="settings-platform-desc">{ch.detail}</span>
                    )}
                  </div>
                </div>

                <div className="settings-platform-actions">
                  {ch.status === "connected" && (
                    confirmKey === ch.key ? (
                      <div className="settings-confirm-row">
                        <span className="settings-confirm-text">确认解绑？</span>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={unbinding === ch.key}
                          onClick={() => void handleUnbind(ch.key)}
                        >
                          {unbinding === ch.key ? "解绑中..." : "确认"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setConfirmKey(null)}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setConfirmKey(ch.key)}
                      >
                        解绑
                      </button>
                    )
                  )}
                  {(ch.status === "not_connected" || ch.status === "not_configured") && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleBind}
                    >
                      扫码绑定
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && channels.length === 0 && (
        <div className="settings-section">
          <div className="settings-field-hint">暂无频道数据</div>
        </div>
      )}
    </div>
  );
}

// ── Local-mode Gateway ───────────────────────────────────────────────────────

function LocalGateway({ profile }: { profile?: string }): React.JSX.Element {
  const { t } = useI18n();
  const [gatewayRunning, setGatewayRunning] = useState(false);
  const [env, setEnv] = useState<Record<string, string>>({});
  const [platformEnabled, setPlatformEnabled] = useState<Record<string, boolean>>({});
  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const gatewayStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const platformStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConfig = useCallback(async (): Promise<void> => {
    const envData = await window.hermesAPI.getEnv(profile);
    setEnv(envData);
    const gwStatus = await window.hermesAPI.gatewayStatus();
    setGatewayRunning(gwStatus);
    const platforms = await window.hermesAPI.getPlatformEnabled(profile);
    setPlatformEnabled(platforms);
    const statuses = await window.hermesAPI.getPlatformStatus(profile);
    setPlatformStatus(statuses);
  }, [profile]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await window.hermesAPI.gatewayStatus();
      setGatewayRunning(status);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function toggleGateway(): Promise<void> {
    if (gatewayStatusTimeoutRef.current) {
      clearTimeout(gatewayStatusTimeoutRef.current);
      gatewayStatusTimeoutRef.current = null;
    }
    if (gatewayRunning) {
      await window.hermesAPI.stopGateway();
      setGatewayRunning(false);
    } else {
      const started = await window.hermesAPI.startGateway();
      setGatewayRunning(started);
      gatewayStatusTimeoutRef.current = setTimeout(async () => {
        const status = await window.hermesAPI.gatewayStatus();
        setGatewayRunning(status);
        gatewayStatusTimeoutRef.current = null;
      }, 5000);
    }
  }

  async function togglePlatform(platform: string): Promise<void> {
    if (platformStatusTimeoutRef.current) {
      clearTimeout(platformStatusTimeoutRef.current);
      platformStatusTimeoutRef.current = null;
    }
    const newValue = !platformEnabled[platform];
    setPlatformEnabled((prev) => ({ ...prev, [platform]: newValue }));
    await window.hermesAPI.setPlatformEnabled(platform, newValue, profile);
    platformStatusTimeoutRef.current = setTimeout(async () => {
      const status = await window.hermesAPI.gatewayStatus();
      setGatewayRunning(status);
      const statuses = await window.hermesAPI.getPlatformStatus(profile);
      setPlatformStatus(statuses);
      platformStatusTimeoutRef.current = null;
    }, 3000);
  }

  function statusForPlatform(platformKey: string): PlatformStatus {
    return (
      platformStatus[platformKey] || {
        key: platformKey,
        status: platformEnabled[platformKey] ? "connected" : "not_configured",
      }
    );
  }

  function platformStatusLabel(status: PlatformStatus): string {
    if (status.status === "connected") return "已连接";
    if (status.status === "not_connected") return "未连接";
    if (status.status === "unsupported") return "暂未接入";
    return "未配置";
  }

  async function handleBlur(key: string): Promise<void> {
    const value = env[key] || "";
    await window.hermesAPI.setEnv(key, value, profile);
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  }

  function handleChange(key: string, value: string): void {
    setEnv((prev) => ({ ...prev, [key]: value }));
  }

  function toggleVisibility(key: string): void {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const platformFieldKeys = new Set(GATEWAY_PLATFORMS.flatMap((p) => p.fields));
  const otherSections = GATEWAY_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !platformFieldKeys.has(item.key)),
  })).filter((section) => section.items.length > 0);
  const fieldDefs = new Map(
    GATEWAY_SECTIONS.flatMap((s) => s.items).map((f) => [f.key, f]),
  );

  return (
    <div className="settings-container">
      <h1 className="settings-header">{t("gateway.title")}</h1>

      <div className="settings-section">
        <div className="settings-section-title">
          {t("gateway.messagingGateway")}
        </div>
        <div className="settings-field">
          <label className="settings-field-label">{t("gateway.status")}</label>
          <div className="settings-gateway-row">
            <span
              className={`settings-gateway-status ${gatewayRunning ? "running" : "stopped"}`}
            >
              {gatewayRunning ? t("gateway.running") : t("gateway.stopped")}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={toggleGateway}
            >
              {gatewayRunning ? t("common.stop") : t("common.start")}
            </button>
          </div>
          <div className="settings-field-hint">{t("gateway.gatewayHint")}</div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t("gateway.platforms")}</div>
        {GATEWAY_PLATFORMS.map((platform) => {
          const status = statusForPlatform(platform.key);
          return (
            <div key={platform.key} className="settings-platform-card">
              <div className="settings-platform-header">
                <div className="settings-platform-left">
                  <BrandLogo provider={platform.key} size={28} />
                  <div className="settings-platform-info">
                    <div className="settings-platform-title-row">
                      <span className="settings-platform-label">
                        {status.label || t(platform.label)}
                      </span>
                      <span
                        className={`settings-platform-status ${status.status}`}
                      >
                        {platformStatusLabel(status)}
                      </span>
                    </div>
                    <span className="settings-platform-desc">
                      {status.detail || t(platform.description)}
                    </span>
                  </div>
                </div>
                <label className="tools-toggle">
                  <input
                    type="checkbox"
                    checked={!!platformEnabled[platform.key]}
                    onChange={() => togglePlatform(platform.key)}
                  />
                  <span className="tools-toggle-track" />
                </label>
              </div>
              {platformEnabled[platform.key] && (
                <div className="settings-platform-fields">
                  {platform.fields.map((fieldKey) => {
                    const field = fieldDefs.get(fieldKey);
                    if (!field) return null;
                    return (
                      <div key={field.key} className="settings-field">
                        <label className="settings-field-label">
                          {t(field.label)}
                          {savedKey === field.key && (
                            <span className="settings-saved">
                              {t("common.saved")}
                            </span>
                          )}
                        </label>
                        <div className="settings-input-row">
                          <input
                            className="input"
                            type={
                              field.type === "password" &&
                              !visibleKeys.has(field.key)
                                ? "password"
                                : "text"
                            }
                            value={env[field.key] || ""}
                            onChange={(e) =>
                              handleChange(field.key, e.target.value)
                            }
                            onBlur={() => handleBlur(field.key)}
                            placeholder={t(field.label)}
                          />
                          {field.type === "password" && (
                            <button
                              className="btn-ghost settings-toggle-btn"
                              onClick={() => toggleVisibility(field.key)}
                            >
                              {visibleKeys.has(field.key)
                                ? t("common.hide")
                                : t("common.show")}
                            </button>
                          )}
                        </div>
                        <div className="settings-field-hint">{t(field.hint)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {otherSections.map((section) => (
        <div key={section.title} className="settings-section">
          <div className="settings-section-title">{t(section.title)}</div>
          {section.items.map((field) => (
            <div key={field.key} className="settings-field">
              <label className="settings-field-label">
                {t(field.label)}
                {savedKey === field.key && (
                  <span className="settings-saved">{t("common.saved")}</span>
                )}
              </label>
              <div className="settings-input-row">
                <input
                  className="input"
                  type={
                    field.type === "password" && !visibleKeys.has(field.key)
                      ? "password"
                      : "text"
                  }
                  value={env[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  onBlur={() => handleBlur(field.key)}
                  placeholder={t(field.label)}
                />
                {field.type === "password" && (
                  <button
                    className="btn-ghost settings-toggle-btn"
                    onClick={() => toggleVisibility(field.key)}
                  >
                    {visibleKeys.has(field.key)
                      ? t("common.hide")
                      : t("common.show")}
                  </button>
                )}
              </div>
              <div className="settings-field-hint">{t(field.hint)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Root dispatcher ──────────────────────────────────────────────────────────

function Gateway({ profile }: { profile?: string }): React.JSX.Element {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [enterpriseMode, setEnterpriseMode] = useState(false);

  useEffect(() => {
    void window.hermesAPI.getConnectionConfig().then((config) => {
      const isEnterprise = config.mode === "remote" && config.openClawDirect;
      setEnterpriseMode(isEnterprise);
      setRemoteUrl(isEnterprise ? config.remoteUrl || "" : null);
    });
  }, []);

  if (enterpriseMode && remoteUrl !== null) {
    return <EnterpriseGateway remoteUrl={remoteUrl} />;
  }

  return <LocalGateway profile={profile} />;
}

export default Gateway;
