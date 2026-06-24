import { Pencil, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WebDavFile } from "@/core/bridge/tauri-commands";

interface WebDavFileBrowserDialogsProps {
  renameOpen: boolean;
  setRenameOpen: (open: boolean) => void;
  renameItem: WebDavFile | null;
  renameNewName: string;
  setRenameNewName: (name: string) => void;
  submitRename: () => void;
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: (open: boolean) => void;
  deleteItems: WebDavFile[];
  submitDelete: () => void;
}

export default function WebDavFileBrowserDialogs({
  renameOpen,
  setRenameOpen,
  renameItem,
  renameNewName,
  setRenameNewName,
  submitRename,
  deleteConfirmOpen,
  setDeleteConfirmOpen,
  deleteItems,
  submitDelete,
}: WebDavFileBrowserDialogsProps) {
  return (
    <>
      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Pencil className="size-5" />
            </div>
            <DialogTitle>重命名项目</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground mb-3">
              请输入新的名称：
            </p>
            <Input
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              placeholder="请输入名称"
              className="w-full text-foreground bg-background"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameNewName.trim() && renameNewName !== renameItem?.name) {
                  submitRename();
                }
              }}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button
              onClick={submitRename}
              disabled={!renameNewName.trim() || renameNewName === renameItem?.name}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent size="sm" variant="alert">
          <DialogHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle className="text-destructive">确认删除</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {deleteItems.length === 1
                ? `确认删除项目“${deleteItems[0].name}”？`
                : `确认删除选中的 ${deleteItems.length} 个项目？`}
            </DialogDescription>
            <p className="text-sm leading-6 text-muted-foreground mt-2">
              此操作将永久删除 WebDAV 服务器上的文件或文件夹，且无法恢复。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={submitDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
