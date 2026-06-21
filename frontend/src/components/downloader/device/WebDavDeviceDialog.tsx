import { useState, useCallback, useEffect } from "react";
import { Server, Eye, EyeOff, Loader2, CheckCircle2, XCircle, Plug, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { testWebDavConnection } from "@/core/bridge/tauri-commands";
import type { SaveWebDavDeviceInput, WebDavDevice } from "@/core/bridge/tauri-commands";

interface WebDavDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: SaveWebDavDeviceInput) => Promise<void>;
  initialDevice?: WebDavDevice | null;
}

type ConnectionTestState = "idle" | "testing" | "success" | "error";

interface WebDavFormState {
  serverUrl: string;
  username: string;
  password: string;
  remotePath: string;
  displayName: string;
}

const INITIAL_WEBDAV_FORM: WebDavFormState = {
  serverUrl: "",
  username: "",
  password: "",
  remotePath: "/",
  displayName: "",
};

export default function WebDavDeviceDialog({ open, onOpenChange, onSave, initialDevice }: WebDavDeviceDialogProps) {
  const [webDavForm, setWebDavForm] = useState<WebDavFormState>(INITIAL_WEBDAV_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [testState, setTestState] = useState<ConnectionTestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setWebDavForm(INITIAL_WEBDAV_FORM);
    setTestState("idle");
    setTestMessage("");
    setShowPassword(false);
    setSaving(false);
  }, []);

  const handleOpenChangeInner = useCallback(
    (openState: boolean) => {
      onOpenChange(openState);
      if (!openState) {
        resetForm();
      }
    },
    [onOpenChange, resetForm]
  );

  // Populate form on edit mode
  useEffect(() => {
    if (open) {
      if (initialDevice) {
        setWebDavForm({
          serverUrl: initialDevice.server_url,
          username: initialDevice.username,
          password: "", // Keep blank; backend won't update it if left empty
          remotePath: initialDevice.remote_path,
          displayName: initialDevice.name,
        });
        setTestState("success");
        setTestMessage("正在编辑已有配置");
      } else {
        setWebDavForm(INITIAL_WEBDAV_FORM);
        setTestState("idle");
        setTestMessage("");
      }
    }
  }, [open, initialDevice]);

  const updateFormField = useCallback(
    <K extends keyof WebDavFormState>(key: K, value: WebDavFormState[K]) => {
      setWebDavForm((prev) => ({ ...prev, [key]: value }));
      
      // Reset test state only if core connection parameters are modified
      if (key === "serverUrl" || key === "username" || key === "password") {
        setTestState((prev) => {
          if (prev !== "idle") {
            setTestMessage("");
            return "idle";
          }
          return prev;
        });
      }
    },
    []
  );

  const handleTestConnection = useCallback(async () => {
    if (!webDavForm.serverUrl.trim() || !webDavForm.username.trim()) return;

    setTestState("testing");
    setTestMessage("正在连接到 WebDAV 服务器...");

    try {
      // For existing devices, if they didn't input a new password, we pass undefined/empty
      const msg = await testWebDavConnection(
        webDavForm.serverUrl,
        webDavForm.username,
        webDavForm.password || undefined
      );
      setTestState("success");
      setTestMessage(msg || "连接成功！服务器响应正常");
    } catch (err) {
      setTestState("error");
      setTestMessage(typeof err === "string" ? err : String(err) || "连接失败：请检查服务器地址或账号密码");
    }
  }, [webDavForm]);

  const handleSaveDevice = useCallback(async () => {
    if (testState !== "success") return;
    setSaving(true);
    try {
      await onSave({
        id: initialDevice?.id,
        display_name: webDavForm.displayName.trim() || "WebDAV 存储",
        server_url: webDavForm.serverUrl.trim(),
        username: webDavForm.username.trim(),
        password: webDavForm.password || undefined, // Backend will retain old password if omitted/empty
        remote_path: webDavForm.remotePath.trim() || "/",
      });
      handleOpenChangeInner(false);
    } catch (err) {
      console.error("保存失败", err);
    } finally {
      setSaving(false);
    }
  }, [testState, webDavForm, onSave, handleOpenChangeInner, initialDevice]);

  const isEditMode = !!initialDevice;

  const canTest =
    webDavForm.serverUrl.trim().length > 0 &&
    webDavForm.username.trim().length > 0 &&
    (isEditMode || webDavForm.password.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChangeInner}>
      <DialogContent size="lg" showCloseButton>
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Server className="size-5" />
          </div>
          <DialogTitle>{isEditMode ? "编辑 WebDAV 存储" : "添加 WebDAV 存储"}</DialogTitle>
          <DialogDescription>
            配置远程 WebDAV 服务器连接信息，支持坚果云、Alist、群晖等服务
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <Field label="显示名称" htmlFor="webdav-name">
            <Input
              id="webdav-name"
              placeholder="例如：坚果云 WebDAV"
              value={webDavForm.displayName}
              onChange={(e) => updateFormField("displayName", e.target.value)}
            />
          </Field>

          <Field label="服务器地址" htmlFor="webdav-url" required>
            <Input
              id="webdav-url"
              placeholder="https://dav.example.com/dav/"
              value={webDavForm.serverUrl}
              onChange={(e) => updateFormField("serverUrl", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="用户名" htmlFor="webdav-user" required>
              <Input
                id="webdav-user"
                placeholder="账号或邮箱"
                autoComplete="username"
                value={webDavForm.username}
                onChange={(e) => updateFormField("username", e.target.value)}
              />
            </Field>

            <Field
              label={isEditMode ? "密码 (为空则不修改)" : "密码"}
              htmlFor="webdav-pass"
              required={!isEditMode}
            >
              <div className="relative">
                <Input
                  id="webdav-pass"
                  type={showPassword ? "text" : "password"}
                  placeholder={isEditMode ? "••••••••" : "应用专用密码"}
                  autoComplete="current-password"
                  className="pr-10"
                  value={webDavForm.password}
                  onChange={(e) => updateFormField("password", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>

          <Field label="远程路径" htmlFor="webdav-path" description="服务器上的文件存放目录，默认为根目录">
            <Input
              id="webdav-path"
              placeholder="/"
              value={webDavForm.remotePath}
              onChange={(e) => updateFormField("remotePath", e.target.value)}
            />
          </Field>

          {/* Connection test result banner */}
          {testState !== "idle" && (
            <div
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
                testState === "testing"
                  ? "bg-muted/50 text-muted-foreground border border-border/50"
                  : testState === "success"
                    ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
              }`}
            >
              {testState === "testing" && <Loader2 className="size-4 animate-spin shrink-0" />}
              {testState === "success" && <CheckCircle2 className="size-4 shrink-0" />}
              {testState === "error" && <XCircle className="size-4 shrink-0" />}
              <span className="min-w-0 flex-1">{testMessage}</span>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="secondary"
            className="gap-2 font-semibold border border-border/60"
            disabled={!canTest || testState === "testing"}
            onClick={handleTestConnection}
          >
            {testState === "testing" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : testState === "success" ? (
              <CheckCircle2 className="size-4 text-green-500" />
            ) : testState === "error" ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <Plug className="size-4" />
            )}
            {testState === "testing"
              ? "测试中..."
              : testState === "success"
                ? "连接正常"
                : testState === "error"
                  ? "重新测试"
                  : "测试连接"}
          </Button>

          <Button
            variant="default"
            className="gap-2 font-semibold"
            disabled={testState !== "success" || saving}
            onClick={handleSaveDevice}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {isEditMode ? "更新设备" : "保存设备"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
