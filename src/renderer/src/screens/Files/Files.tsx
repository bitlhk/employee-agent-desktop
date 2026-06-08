import { useState, useEffect, useCallback, useRef } from "react";
import { Folder, ChevronRight, ChevronDown, Download, Upload, Refresh, File as FileIcon } from "lucide-react";
import { useI18n } from "../../components/useI18n";

type FileNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt: string;
};

const TEXT_EXTENSIONS = new Set([
  "md","txt","csv","json","yaml","yml","xml","toml","ini","conf","log","html","htm","css",
]);

function isTextFile(name: string): boolean {
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(i + 1).toLowerCase());
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({
  node,
  depth,
  expanded,
  protected: isProtected,
  onToggle,
  onPreview,
  onDownload,
  downloading,
}: {
  node: FileNode;
  depth: number;
  expanded: boolean;
  protected: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const { t } = useI18n();
  const isDir = node.type === "directory";

  return (
    <div
      className={`files-row ${isDir ? "files-row-dir" : "files-row-file"}`}
      style={{ paddingLeft: 12 + depth * 20 }}
    >
      <span className="files-row-icon-wrap" onClick={isDir ? onToggle : onPreview}>
        {isDir ? (
          <>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Folder size={14} className="files-folder-icon" />
          </>
        ) : (
          <FileIcon size={14} className="files-file-icon" />
        )}
      </span>
      <span className="files-row-name" onClick={isDir ? onToggle : onPreview}>
        {node.name}
        {isProtected && <span className="files-protected-badge">{t("files.protected")}</span>}
      </span>
      {!isDir && (
        <>
          <span className="files-row-size">{formatSize(node.size)}</span>
          <button
            className="files-row-btn"
            onClick={onDownload}
            disabled={downloading}
            title={t("files.download")}
          >
            <Download size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function Files(): React.JSX.Element {
  const { t } = useI18n();
  const [files, setFiles] = useState<FileNode[]>([]);
  const [protectedFiles, setProtectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.hermesAPI.listDesktopFiles();
      setFiles(result.files);
      setProtectedFiles(new Set(result.protectedFiles));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss status messages
  useEffect(() => {
    if (!uploadStatus) return;
    const t = setTimeout(() => setUploadStatus(null), 3000);
    return () => clearTimeout(t);
  }, [uploadStatus]);

  useEffect(() => {
    if (!downloadError) return;
    const t = setTimeout(() => setDownloadError(null), 3000);
    return () => clearTimeout(t);
  }, [downloadError]);

  const handleToggle = (nodePath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nodePath)) next.delete(nodePath);
      else next.add(nodePath);
      return next;
    });
  };

  const handlePreview = async (node: FileNode) => {
    if (!isTextFile(node.name)) {
      handleDownload(node);
      return;
    }
    if (previewPath === node.path) {
      setPreviewPath(null);
      return;
    }
    setPreviewPath(node.path);
    setPreviewContent("");
    setPreviewLoading(true);
    try {
      const result = await window.hermesAPI.readDesktopFile(node.path);
      if (result) setPreviewContent(result.content);
      else setPreviewContent("[无法读取文件]");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (node: FileNode) => {
    setDownloadingPath(node.path);
    setDownloadError(null);
    try {
      const result = await window.hermesAPI.downloadDesktopFile(node.path);
      if (!result.ok && result.error !== "cancelled") setDownloadError(result.error || t("files.downloadFailed"));
    } finally {
      setDownloadingPath(null);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    setUploadStatus(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      // dataUrl = "data:<mime>;base64,<data>"
      const base64 = dataUrl.split(",")[1] || "";
      const result = await window.hermesAPI.uploadDesktopFile(file.name, base64);
      if (result.ok) {
        setUploadStatus({ type: "success", msg: t("files.uploadSuccess") });
        load();
      } else {
        setUploadStatus({ type: "error", msg: result.error || t("files.uploadFailed") });
      }
    };
    reader.readAsDataURL(file);
  };

  // Build visible tree: only show children of expanded directories
  const visibleNodes: { node: FileNode; depth: number }[] = [];
  function buildVisible(parentPath: string, depth: number) {
    const children = files.filter((f) => {
      const p = f.path;
      if (!parentPath) {
        return !p.includes("/");
      }
      const prefix = parentPath + "/";
      if (!p.startsWith(prefix)) return false;
      const rest = p.slice(prefix.length);
      return !rest.includes("/");
    });
    for (const child of children) {
      visibleNodes.push({ node: child, depth });
      if (child.type === "directory" && expanded.has(child.path)) {
        buildVisible(child.path, depth + 1);
      }
    }
  }
  buildVisible("", 0);

  return (
    <div className="settings-container">
      <div className="memory-header">
        <div>
          <h1 className="settings-header" style={{ marginBottom: 4 }}>{t("files.title")}</h1>
          <p className="memory-subtitle">{t("files.subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleUploadClick}>
            <Upload size={13} />
            {t("files.upload")}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <Refresh size={13} />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        onChange={handleFileChange}
        accept=".md,.txt,.csv,.json,.yaml,.yml,.xml,.toml,.ini,.conf,.log,.pdf,.docx,.xls,.xlsx,.pptx,.png,.jpg,.jpeg,.gif,.svg,.webp,.html,.htm,.css,.zip,.tar,.gz,.mp3,.wav,.m4a,.aac,.webm,.ogg,.mp4"
      />

      {uploadStatus && (
        <div className={`files-status-bar files-status-${uploadStatus.type}`}>{uploadStatus.msg}</div>
      )}
      {downloadError && (
        <div className="files-status-bar files-status-error">{downloadError}</div>
      )}

      <div className="files-tree">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <div className="loading-spinner" />
          </div>
        ) : visibleNodes.length === 0 ? (
          <div className="files-empty">{t("files.noFiles")}</div>
        ) : (
          visibleNodes.map(({ node, depth }) => (
            <FileRow
              key={node.path}
              node={node}
              depth={depth}
              expanded={expanded.has(node.path)}
              protected={protectedFiles.has(node.name) && !node.path.includes("/")}
              onToggle={() => handleToggle(node.path)}
              onPreview={() => handlePreview(node)}
              onDownload={() => handleDownload(node)}
              downloading={downloadingPath === node.path}
            />
          ))
        )}
      </div>

      {previewPath && (
        <div className="files-preview">
          <div className="files-preview-header">
            <span className="files-preview-path">{previewPath}</span>
            <button className="btn-ghost" onClick={() => setPreviewPath(null)}>✕</button>
          </div>
          <div className="files-preview-content">
            {previewLoading ? (
              <div className="loading-spinner" />
            ) : (
              <pre className="files-preview-pre">{previewContent}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Files;
