import { useState } from "react";
import HermesLogo from "../../components/common/HermesLogo";
import {
  ArrowRight,
  Refresh,
  Copy,
  Globe,
  KeyRound,
  Spinner,
} from "../../assets/icons";
import { getInstallCmd } from "../../constants";
import { useI18n } from "../../components/useI18n";

interface WelcomeProps {
  error: string | null;
  connectionMode: "local" | "remote" | "ssh";
  onStart: () => void;
  onRecheck: () => void;
  onSwitchToLocal: () => void;
}

type ConnectionPanel = "none" | "enterprise" | "remote" | "ssh";

function Welcome({
  error,
  connectionMode,
  onStart,
  onRecheck,
  onSwitchToLocal,
}: WelcomeProps): React.JSX.Element {
  const { t } = useI18n();
  const [panel, setPanel] = useState<ConnectionPanel>("none");

  // Enterprise state
  const [enterpriseUrl, setEnterpriseUrl] = useState("https://work.linggan.top");
  const [enterpriseToken, setEnterpriseToken] = useState("");
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const [enterpriseTesting, setEnterpriseTesting] = useState(false);

  // Remote state
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteApiKey, setRemoteApiKey] = useState("");
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteTesting, setRemoteTesting] = useState(false);

  // SSH state
  const [sshHost, setSshHost] = useState("111.119.236.165");
  const [sshPort, setSshPort] = useState("22");
  const [sshUser, setSshUser] = useState("ubuntu");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [sshRemotePort, setSshRemotePort] = useState("18789");
  const [sshGatewayToken, setSshGatewayToken] = useState("");
  const [sshAgentId, setSshAgentId] = useState("trial_lgc-ppstsl9ddr");
  const [sshError, setSshError] = useState<string | null>(null);
  const [sshTesting, setSshTesting] = useState(false);

  async function handleConnectEnterprise(): Promise<void> {
    const url = enterpriseUrl.trim();
    if (!url) {
      setEnterpriseError("Please enter the enterprise service URL.");
      return;
    }
    setEnterpriseTesting(true);
    setEnterpriseError(null);
    try {
      await window.hermesAPI.connectEnterprise(
        url,
        enterpriseToken.trim() || undefined,
      );
      onRecheck();
    } catch (e) {
      setEnterpriseError(
        "Enterprise connection failed: " + (e as Error).message,
      );
    } finally {
      setEnterpriseTesting(false);
    }
  }

  async function handleConnectRemote(): Promise<void> {
    const url = remoteUrl.trim();
    const key = remoteApiKey.trim();
    if (!url) {
      setRemoteError("Please enter a URL.");
      return;
    }
    setRemoteTesting(true);
    setRemoteError(null);
    try {
      const ok = await window.hermesAPI.testRemoteConnection(url, key);
      if (ok) {
        await window.hermesAPI.setConnectionConfig("remote", url, key);
        onRecheck();
      } else {
        setRemoteError(
          "Could not reach Hermes at this URL. Check the URL and API key.\n\nLeave the key empty if the server accepts unauthenticated requests (e.g. via SSH tunnel to localhost).",
        );
      }
    } catch {
      setRemoteError("Connection test failed.");
    } finally {
      setRemoteTesting(false);
    }
  }

  async function handleConnectSsh(): Promise<void> {
    const host = sshHost.trim();
    const user = sshUser.trim();
    if (!host || !user) {
      setSshError("Host and username are required.");
      return;
    }
    const port = parseInt(sshPort, 10) || 22;
    const remotePort = parseInt(sshRemotePort, 10) || 18789;
    setSshTesting(true);
    setSshError(null);
    try {
      const ok = await window.hermesAPI.testSshConnection(
        host,
        port,
        user,
        sshKeyPath.trim(),
        remotePort,
      );
      if (ok) {
        await window.hermesAPI.setSshConfig(
          host,
          port,
          user,
          sshKeyPath.trim(),
          remotePort,
          18789,
          sshGatewayToken.trim(),
          sshAgentId.trim(),
        );
        onRecheck();
      } else {
        setSshError(
          "Could not connect via SSH or reach OpenClaw on the remote. Make sure:\n• SSH key is correct (or default ~/.ssh/id_rsa works)\n• OpenClaw gateway is running on the remote\n• The remote port is correct (default 18789)",
        );
      }
    } catch (e) {
      setSshError("SSH connection test failed: " + (e as Error).message);
    } finally {
      setSshTesting(false);
    }
  }

  if (panel === "remote") {
    return (
      <div className="screen welcome-screen">
        <HermesLogo size={36} />
        <h1 className="welcome-title" style={{ fontSize: 22 }}>
          {t("welcome.connectRemoteTitle")}
        </h1>
        <p className="welcome-subtitle" style={{ marginBottom: 24 }}>
          {t("welcome.connectRemoteSubtitle")}
        </p>

        <div className="welcome-remote-card">
          <label className="welcome-remote-label">
            {t("welcome.remoteServerUrl")}
          </label>
          <input
            type="url"
            className="welcome-remote-input"
            placeholder="http://192.168.1.100:8642"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConnectRemote();
            }}
            autoFocus
          />

          <label className="welcome-remote-label" style={{ marginTop: 12 }}>
            {t("welcome.remoteApiKey")}
          </label>
          <input
            type="password"
            className="welcome-remote-input"
            placeholder={t("welcome.remoteApiKeyPlaceholder")}
            value={remoteApiKey}
            onChange={(e) => setRemoteApiKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConnectRemote();
            }}
          />

          <div className="welcome-remote-row" style={{ marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleConnectRemote}
              disabled={remoteTesting}
              style={{ whiteSpace: "nowrap", width: "100%" }}
            >
              {remoteTesting ? (
                <>
                  {t("welcome.testingConnection")}
                  <Spinner size={14} className="animate-spin" />
                </>
              ) : (
                t("welcome.connect")
              )}
            </button>
          </div>
          {remoteError && (
            <p
              className="welcome-remote-error"
              style={{ whiteSpace: "pre-line" }}
            >
              {remoteError}
            </p>
          )}
          <p className="welcome-remote-hint">{t("welcome.remoteHint")}</p>
        </div>

        <button
          className="btn-ghost"
          onClick={() => setPanel("none")}
          style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  if (panel === "enterprise") {
    return (
      <div className="screen welcome-screen">
        <HermesLogo size={36} />
        <h1 className="welcome-title" style={{ fontSize: 22 }}>
          Connect to Employee Agent
        </h1>
        <p className="welcome-subtitle" style={{ marginBottom: 24 }}>
          Connect through the enterprise control plane. Agent, Gateway and token
          configuration are provided by the server.
        </p>

        <div className="welcome-remote-card">
          <label className="welcome-remote-label">
            Enterprise Service URL
          </label>
          <input
            type="url"
            className="welcome-remote-input"
            placeholder="https://work.linggan.top"
            value={enterpriseUrl}
            onChange={(e) => setEnterpriseUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConnectEnterprise();
            }}
            autoFocus
          />

          <label className="welcome-remote-label" style={{ marginTop: 12 }}>
            Access Token{" "}
            <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
          </label>
          <input
            type="password"
            className="welcome-remote-input"
            placeholder="Optional for the current MVP"
            value={enterpriseToken}
            onChange={(e) => setEnterpriseToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConnectEnterprise();
            }}
          />

          <div className="welcome-remote-row" style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleConnectEnterprise}
              disabled={enterpriseTesting || !enterpriseUrl.trim()}
              style={{ whiteSpace: "nowrap", width: "100%" }}
            >
              {enterpriseTesting ? (
                <>
                  Connecting…
                  <Spinner size={14} className="animate-spin" />
                </>
              ) : (
                <>
                  Connect
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          {enterpriseError && (
            <p
              className="welcome-remote-error"
              style={{ whiteSpace: "pre-line" }}
            >
              {enterpriseError}
            </p>
          )}

          <p className="welcome-remote-hint">
            No SSH key is required. Desktop talks to employee-agent for control
            data, then streams chat through the configured OpenClaw Gateway.
          </p>
        </div>

        <button
          className="btn-ghost"
          onClick={() => setPanel("none")}
          style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  if (panel === "ssh") {
    return (
      <div className="screen welcome-screen">
        <HermesLogo size={36} />
        <h1 className="welcome-title" style={{ fontSize: 22 }}>
          Connect to OpenClaw
        </h1>
        <p className="welcome-subtitle" style={{ marginBottom: 24 }}>
          Tunnel to a remote OpenClaw gateway over SSH — no exposed ports
          needed. Phase 0 connects to our preset OpenClaw gateway.
        </p>

        <div className="welcome-remote-card">
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 3 }}>
              <label className="welcome-remote-label">SSH Host</label>
              <input
                type="text"
                className="welcome-remote-input"
                placeholder="111.119.236.165"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="welcome-remote-label">SSH Port</label>
              <input
                type="number"
                className="welcome-remote-input"
                placeholder="22"
                value={sshPort}
                onChange={(e) => setSshPort(e.target.value)}
              />
            </div>
          </div>

          <label className="welcome-remote-label" style={{ marginTop: 12 }}>
            Username
          </label>
          <input
            type="text"
            className="welcome-remote-input"
            placeholder="ubuntu"
            value={sshUser}
            onChange={(e) => setSshUser(e.target.value)}
          />

          <label className="welcome-remote-label" style={{ marginTop: 12 }}>
            Private Key Path{" "}
            <span style={{ fontWeight: 400, opacity: 0.6 }}>
              (optional — defaults to ~/.ssh/id_rsa)
            </span>
          </label>
          <input
            type="text"
            className="welcome-remote-input"
            placeholder="~/.ssh/id_rsa"
            value={sshKeyPath}
            onChange={(e) => setSshKeyPath(e.target.value)}
          />

          <label className="welcome-remote-label" style={{ marginTop: 12 }}>
            Remote OpenClaw Gateway Port{" "}
            <span style={{ fontWeight: 400, opacity: 0.6 }}>
              (default 18789)
            </span>
          </label>
          <input
            type="number"
            className="welcome-remote-input"
            placeholder="18789"
            value={sshRemotePort}
            onChange={(e) => setSshRemotePort(e.target.value)}
          />

          <label className="welcome-remote-label" style={{ marginTop: 12 }}>
            Gateway Token{" "}
            <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
          </label>
          <input
            type="password"
            className="welcome-remote-input"
            placeholder="OpenClaw CLAW_GATEWAY_TOKEN, or leave empty when key path can read it"
            value={sshGatewayToken}
            onChange={(e) => setSshGatewayToken(e.target.value)}
          />

          <label className="welcome-remote-label" style={{ marginTop: 12 }}>
            OpenClaw Agent ID
          </label>
          <input
            type="text"
            className="welcome-remote-input"
            placeholder="trial_lgc-ppstsl9ddr"
            value={sshAgentId}
            onChange={(e) => setSshAgentId(e.target.value)}
          />

          <div className="welcome-remote-row" style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleConnectSsh}
              disabled={sshTesting || !sshHost.trim() || !sshUser.trim()}
              style={{ whiteSpace: "nowrap", width: "100%" }}
            >
              {sshTesting ? (
                <>
                  Testing SSH connection…
                  <Spinner size={14} className="animate-spin" />
                </>
              ) : (
                <>
                  Connect to OpenClaw
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>

          {sshError && (
            <p
              className="welcome-remote-error"
              style={{ whiteSpace: "pre-line" }}
            >
              {sshError}
            </p>
          )}

          <p className="welcome-remote-hint">
            Uses your system SSH. Make sure you can already run{" "}
            <code style={{ fontFamily: "monospace", fontSize: 12 }}>
              ssh {sshUser || "user"}@{sshHost || "host"}
            </code>{" "}
            without a password prompt.
          </p>
        </div>

        <button
          className="btn-ghost"
          onClick={() => setPanel("none")}
          style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="screen welcome-screen">
      <HermesLogo size={40} />

      {error ? (
        <>
          <h1 className="welcome-title">{t("welcome.installIssueTitle")}</h1>
          <p className="welcome-subtitle">{error}</p>

          <div className="welcome-actions">
            <button
              className="btn btn-primary welcome-button"
              onClick={onStart}
            >
              {t("welcome.retryInstall")}
              <Refresh size={16} />
            </button>
            <div className="welcome-divider">
              <span>{t("welcome.dividerOr")}</span>
            </div>
            <div className="welcome-terminal-option">
              <p className="welcome-terminal-label">
                {t("welcome.terminalInstallHint")}
              </p>
              <div className="welcome-terminal-box">
                <code>{getInstallCmd()}</code>
                <button
                  className="btn-ghost welcome-copy-btn"
                  onClick={() => navigator.clipboard.writeText(getInstallCmd())}
                  title={t("welcome.copyInstallCommand")}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
            <button
              className="btn btn-secondary welcome-recheck-btn"
              onClick={onRecheck}
            >
              {t("welcome.recheck")}
            </button>
            {connectionMode !== "local" && (
              <button
                className="btn btn-secondary welcome-recheck-btn"
                onClick={onSwitchToLocal}
              >
                {t("welcome.switchToLocal")}
              </button>
            )}
            <div className="welcome-divider">
              <span>or</span>
            </div>
            <button
              className="btn btn-primary welcome-recheck-btn"
              onClick={() => setPanel("enterprise")}
            >
              <Globe size={16} />
              Connect Employee Agent
            </button>{" "}
            <button
              className="btn btn-secondary welcome-recheck-btn "
              onClick={() => setPanel("ssh")}
            >
              <KeyRound size={16} />
              Advanced OpenClaw
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="welcome-title">{t("welcome.title")}</h1>
          <p className="welcome-subtitle">{t("welcome.subtitle")}</p>
          <button className="btn btn-primary welcome-button" onClick={onStart}>
            {t("welcome.getStarted")}
            <ArrowRight size={16} />
          </button>
          <p className="welcome-note">{t("welcome.installSizeHint")}</p>

          <div className="welcome-divider">
            <span>{t("welcome.dividerOr")}</span>
          </div>

          <button
            className="btn btn-secondary welcome-recheck-btn"
            onClick={() => setPanel("enterprise")}
          >
            <Globe size={16} />
            Connect Employee Agent
          </button>

          <button
            className="btn btn-secondary welcome-recheck-btn"
            onClick={() => setPanel("ssh")}
            style={{ marginTop: 12 }}
          >
            <KeyRound size={16} />
            Advanced OpenClaw
          </button>
        </>
      )}
    </div>
  );
}

export default Welcome;
