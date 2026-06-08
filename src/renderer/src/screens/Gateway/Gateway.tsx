import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
// qrcode renders entirely locally via toDataURL — no network request to any third party
import { GATEWAY_SECTIONS, GATEWAY_PLATFORMS } from "../../constants";
import { useI18n } from "../../components/useI18n";
import BrandLogo from "../../components/common/BrandLogo";

type PlatformStatus = {
  key: string;
  status: "connected" | "not_connected" | "not_configured" | "unsupported";
  label?: string;
  detail?: string;
};

type BindState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "scanning"; qrCode: string; pollToken: string; verificationUri?: string; userCode?: string; pollIntervalMs?: number }
  | { phase: "error"; message: string };

function QRCanvas({ data }: { data: string }): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    if (!data) return;
    QRCode.toDataURL(data, { width: 200, margin: 1 })
      .then(setDataUrl)
      .catch(() => {});
  }, [data]);
  if (!dataUrl) return <div className="settings-qr-img" />;
  return <img className="settings-qr-img" src={dataUrl} alt="扫码绑定" />;
}

// ── Enterprise-mode Gateway ──────────────────────────────────────────────────

function statusLabel(status: PlatformStatus["status"]): string {
  if (status === "connected") return "已连接";
  if (status === "not_connected") return "未连接";
  if (status === "unsupported") return "暂未接入";
  return "未配置";
}

function EnterpriseGateway(): React.JSX.Element {
  const [channels, setChannels] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [bindStates, setBindStates] = useState<Record<string, BindState>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [unbinding, setUnbinding] = useState<string | null>(null);
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const loadChannels = useCallback(async () => {
    try {
      const statuses = await window.hermesAPI.getPlatformStatus();
      setChannels(Object.values(statuses));
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
    const t = setInterval(() => void loadChannels(), 15000);
    return () => clearInterval(t);
  }, [loadChannels]);

  // Stop polling for a channel and clear its timer
  function stopPoll(key: string): void {
    if (pollTimers.current[key]) {
      clearInterval(pollTimers.current[key]);
      delete pollTimers.current[key];
    }
  }

  // Cancel scanning for a channel
  function cancelBind(key: string): void {
    stopPoll(key);
    setBindStates((prev) => ({ ...prev, [key]: { phase: "idle" } }));
  }

  async function handleBind(key: string): Promise<void> {
    stopPoll(key);
    setBindStates((prev) => ({ ...prev, [key]: { phase: "loading" } }));

    const result = await window.hermesAPI.enterpriseChannelBegin(key);
    if (!result.ok || !result.qrCode || !result.pollToken) {
      setBindStates((prev) => ({
        ...prev,
        [key]: { phase: "error", message: result.error || "获取二维码失败" },
      }));
      return;
    }

    const { qrCode, pollToken, verificationUri, userCode, pollIntervalMs } = result;
    setBindStates((prev) => ({
      ...prev,
      [key]: { phase: "scanning", qrCode, pollToken, verificationUri, userCode, pollIntervalMs },
    }));

    // Start polling
    const intervalMs = pollIntervalMs || 2000;
    let currentPollToken = pollToken;

    pollTimers.current[key] = setInterval(async () => {
      try {
        const poll = await window.hermesAPI.enterpriseChannelPoll(key, currentPollToken);
        // Update pollToken if rotated (feishu does this)
        if (poll.pollToken) currentPollToken = poll.pollToken;

        if (poll.status === "confirmed") {
          stopPoll(key);
          setBindStates((prev) => ({ ...prev, [key]: { phase: "idle" } }));
          await loadChannels();
        } else if (poll.status === "expired") {
          stopPoll(key);
          setBindStates((prev) => ({ ...prev, [key]: { phase: "error", message: "二维码已过期，请重新获取" } }));
        }
        // "wait" / "pending" / "scanned" — keep polling
      } catch {
        // network hiccup, keep polling
      }
    }, intervalMs);
  }

  async function handleUnbind(key: string): Promise<void> {
    setConfirmKey(null);
    setUnbinding(key);
    try {
      await window.hermesAPI.unbindEnterpriseChannel(key);
      await loadChannels();
    } finally {
      setUnbinding(null);
    }
  }

  // Clean up all poll timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

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
          {channels.map((ch) => {
            const bindState: BindState = bindStates[ch.key] ?? { phase: "idle" };
            const isScanning = bindState.phase === "scanning";

            return (
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
                    {/* Bound: show 解绑 with confirm */}
                    {ch.status === "connected" && !isScanning && (
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

                    {/* Unbound: show 扫码绑定 or loading or cancel */}
                    {(ch.status === "not_connected" || ch.status === "not_configured") && (
                      bindState.phase === "loading" ? (
                        <span className="settings-field-hint">获取中...</span>
                      ) : isScanning ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => cancelBind(ch.key)}
                        >
                          取消
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => void handleBind(ch.key)}
                        >
                          扫码绑定
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Inline QR code panel */}
                {isScanning && bindState.phase === "scanning" && (
                  <div className="settings-qr-panel">
                    <QRCanvas data={bindState.qrCode} />
                    <div className="settings-qr-hint">
                      {ch.key === "feishu" || ch.key === "lark"
                        ? "请用飞书扫描二维码完成授权"
                        : "请用微信扫描二维码"}
                    </div>
                    {bindState.verificationUri && (
                      <div className="settings-qr-hint">
                        无法扫码？
                        <a
                          className="settings-qr-link"
                          href={bindState.verificationUri}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            void window.hermesAPI.openExternal(bindState.verificationUri!);
                          }}
                        >
                          打开授权页
                        </a>
                        {bindState.userCode ? `，输入 ${bindState.userCode}` : ""}
                      </div>
                    )}
                  </div>
                )}

                {/* Error state */}
                {bindState.phase === "error" && (
                  <div className="settings-qr-panel">
                    <div className="settings-qr-hint" style={{ color: "var(--error)" }}>
                      {bindState.message}
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => setBindStates((prev) => ({ ...prev, [ch.key]: { phase: "idle" } }))}
                    >
                      重试
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
                      <span className={`settings-platform-status ${status.status}`}>
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
  const [enterpriseMode, setEnterpriseMode] = useState<boolean | null>(null);

  useEffect(() => {
    void window.hermesAPI.getConnectionConfig().then((config) => {
      setEnterpriseMode(config.mode === "remote" && !!config.openClawDirect);
    });
  }, []);

  if (enterpriseMode === null) return <></>;
  if (enterpriseMode) return <EnterpriseGateway />;
  return <LocalGateway profile={profile} />;
}

export default Gateway;
