import { useState, useMemo, useEffect } from "react"
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, HardDrive, Film, List } from "lucide-react"

import { CategoryDropdown } from "@/components/common/CategoryDropdown"
import { ActionInput } from "@/components/ui/input"
import type { Category } from "@/core/store/useDownloadStore"
import { formatBytes } from "./data"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface TorrentFileInspection {
  path: string
  size: number
}

interface NewTaskBtFormProps {
  url: string
  filename: string
  savePath: string
  totalSize: number | null
  files: TorrentFileInspection[] | null
  loading: boolean
  selectedFiles: number[]
  onSelectedFilesChange: (selected: number[]) => void
  sequential: boolean
  onSequentialChange: (value: boolean) => void
  onPickSaveDirectory: () => void
  categoryId: number | null
  categories: Category[]
  onCategoryChange: (value: number | null) => void
  onSavePathChange: (value: string) => void
}

interface TreeNode {
  name: string
  path: string
  size: number
  isFolder: boolean
  children: TreeNode[]
  index?: number // present only if isFolder is false
}

// Build a tree from a flat list of paths
function buildTree(files: TorrentFileInspection[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    size: 0,
    isFolder: true,
    children: [],
  }

  files.forEach((file, index) => {
    const parts = file.path.split("/")
    let current = root
    let currentPath = ""

    parts.forEach((part, partIndex) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLast = partIndex === parts.length - 1

      if (isLast) {
        current.children.push({
          name: part,
          path: currentPath,
          size: file.size,
          isFolder: false,
          children: [],
          index,
        })
      } else {
        let folder = current.children.find((child) => child.isFolder && child.name === part)
        if (!folder) {
          folder = {
            name: part,
            path: currentPath,
            size: 0,
            isFolder: true,
            children: [],
          }
          current.children.push(folder)
        }
        current = folder
      }
    })
  })

  // Calculate folder sizes recursively
  function calculateSize(node: TreeNode): number {
    if (!node.isFolder) return node.size
    node.size = node.children.reduce((acc, child) => acc + calculateSize(child), 0)
    return node.size
  }
  calculateSize(root)

  return root
}

// Get all file indexes under a folder recursively
function getFolderFileIndexes(node: TreeNode): number[] {
  const indexes: number[] = []
  function traverse(n: TreeNode) {
    if (!n.isFolder) {
      if (n.index !== undefined) indexes.push(n.index)
    } else {
      n.children.forEach(traverse)
    }
  }
  traverse(node)
  return indexes
}

// Check if file is a video
function isVideoFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  return ["mp4", "mkv", "avi", "mov", "flv", "rmvb", "3gp", "ts", "wmv", "webm"].includes(ext)
}

export function NewTaskBtForm({
  filename,
  savePath,
  files = [],
  loading,
  selectedFiles,
  onSelectedFilesChange,
  sequential,
  onSequentialChange,
  onPickSaveDirectory,
  categoryId,
  categories,
  onCategoryChange,
  onSavePathChange,
}: NewTaskBtFormProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [videoOnly, setVideoOnly] = useState(false)

  // Memoize tree representation
  const tree = useMemo(() => {
    if (!files || files.length === 0) return null
    return buildTree(files)
  }, [files])

  // Automatically expand the root folder by default
  useEffect(() => {
    if (tree && tree.children.length > 0) {
      const rootFolder = tree.children[0]
      if (rootFolder.isFolder) {
        setExpandedFolders((prev) => ({
          ...prev,
          [rootFolder.path]: true,
        }))
      }
    }
  }, [tree])

  // Get flat list of all file indexes
  const allFileIndexes = useMemo(() => {
    return files ? files.map((_, i) => i) : []
  }, [files])

  // Get index of all video files
  const videoFileIndexes = useMemo(() => {
    if (!files) return []
    return files
      .map((file, index) => (isVideoFile(file.path) ? index : -1))
      .filter((index) => index !== -1)
  }, [files])

  // Calculate selected files total size
  const selectedSize = useMemo(() => {
    if (!files) return 0
    return selectedFiles.reduce((acc, index) => acc + (files[index]?.size || 0), 0)
  }, [files, selectedFiles])

  // Toggle "Select All"
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectedFilesChange(allFileIndexes)
      setVideoOnly(false)
    } else {
      onSelectedFilesChange([])
      setVideoOnly(false)
    }
  }

  // Toggle "Videos Only"
  const handleSelectVideos = (checked: boolean) => {
    setVideoOnly(checked)
    if (checked) {
      onSelectedFilesChange(videoFileIndexes)
    } else {
      onSelectedFilesChange(allFileIndexes)
    }
  }

  // Toggle folder selection recursively
  const handleFolderSelect = (node: TreeNode, checked: boolean) => {
    const folderIndexes = getFolderFileIndexes(node)
    let nextSelected = [...selectedFiles]

    if (checked) {
      // Add missing indexes
      folderIndexes.forEach((idx) => {
        if (!nextSelected.includes(idx)) nextSelected.push(idx)
      })
    } else {
      // Remove indexes
      nextSelected = nextSelected.filter((idx) => !folderIndexes.includes(idx))
    }

    onSelectedFilesChange(nextSelected)
    setVideoOnly(false)
  }

  // Toggle single file selection
  const handleFileSelect = (index: number, checked: boolean) => {
    let nextSelected = [...selectedFiles]
    if (checked) {
      if (!nextSelected.includes(index)) nextSelected.push(index)
    } else {
      nextSelected = nextSelected.filter((idx) => idx !== index)
    }
    onSelectedFilesChange(nextSelected)
    setVideoOnly(false)
  }

  // Toggle folder expand/collapse
  const toggleFolderExpand = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }))
  }

  // Check if a folder is fully or partially selected
  const getFolderSelectState = (node: TreeNode): "all" | "some" | "none" => {
    const folderIndexes = getFolderFileIndexes(node)
    if (folderIndexes.length === 0) return "none"

    const selectedCount = folderIndexes.filter((idx) => selectedFiles.includes(idx)).length

    if (selectedCount === folderIndexes.length) return "all"
    if (selectedCount > 0) return "some"
    return "none"
  }

  // Render tree node recursively
  const renderNode = (node: TreeNode, depth: number) => {
    const indent = depth * 18

    if (node.isFolder) {
      const isExpanded = expandedFolders[node.path]
      const selectState = getFolderSelectState(node)
      // Skip rendering empty root container node (that holds the main contents)
      if (node.path === "") {
        return <div key="root">{node.children.map((child) => renderNode(child, depth))}</div>
      }

      return (
        <div key={node.path} className="flex flex-col">
          <div
            className="group flex h-9 items-center hover:bg-secondary/40 px-2 rounded-md transition-colors"
            style={{ paddingLeft: `${indent}px` }}
          >
            <button
              type="button"
              onClick={() => toggleFolderExpand(node.path)}
              className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-secondary rounded-sm mr-0.5 transition-colors"
            >
              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <Checkbox
                checked={selectState === "all" ? true : selectState === "some" ? "indeterminate" : false}
                onCheckedChange={(checked) => handleFolderSelect(node, checked === true)}
              />
              <span className="text-primary/80 shrink-0">
                {isExpanded ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
              </span>
            </div>

            <span className="ml-2 text-sm font-medium text-foreground truncate max-w-[280px]">
              {node.name}
            </span>

            <span className="ml-auto text-xs text-muted-foreground/75 font-mono">
              {formatBytes(node.size)}
            </span>
          </div>

          {isExpanded && (
            <div className="flex flex-col">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      )
    } else {
      // File node
      const isSelected = selectedFiles.includes(node.index!)
      const fileExt = node.name.split(".").pop() || ""

      return (
        <div
          key={node.path}
          className="group flex h-9 items-center hover:bg-secondary/40 px-2 rounded-md transition-colors"
          style={{ paddingLeft: `${indent}px` }}
        >
          <div className="w-[26px] shrink-0" aria-hidden="true" />
          <div className="flex items-center gap-2 shrink-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => handleFileSelect(node.index!, checked === true)}
            />
            <span className="text-primary/75 shrink-0">
              {isVideoFile(node.name) ? <Film className="size-4" /> : <File className="size-4" />}
            </span>
          </div>

          <span className="ml-2 text-sm text-foreground/90 truncate max-w-[280px]">
            {node.name}
          </span>

          <span className="ml-4 text-xs text-muted-foreground/60 font-mono uppercase bg-secondary/35 px-1.5 py-0.5 rounded">
            {fileExt}
          </span>

          <span className="ml-auto text-xs text-muted-foreground/75 font-mono">
            {formatBytes(node.size)}
          </span>
        </div>
      )
    }
  }

  const allSelected = !!(files && files.length > 0 && selectedFiles.length === files.length)
  const someSelected = selectedFiles.length > 0 && selectedFiles.length < (files?.length || 0)

  return (
    <div className="space-y-4">
      {/* Torrent Header Info */}
      <div className="flex items-center gap-3 bg-secondary/20 p-3.5 rounded-xl border border-border/60">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary font-bold text-lg select-none">
          BT
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate max-w-[400px]">
            {filename}
          </div>
          <div className="text-xs text-muted-foreground/80 mt-0.5">
            已选 {selectedFiles.length}/{files?.length || 0} 个文件 · {formatBytes(selectedSize)}
          </div>
        </div>
      </div>

      {/* Main File Selector Box */}
      <div className="border border-border/80 rounded-xl bg-background overflow-hidden shadow-sm">
        {/* Selector Toolbar */}
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-secondary/20 border-b border-border/60 text-xs">
          <div className="flex items-center gap-2.5">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(checked) => handleSelectAll(checked === true)}
              id="select-all"
            />
            <label htmlFor="select-all" className="font-medium text-foreground cursor-pointer select-none">
              全选
            </label>
            <span className="text-muted-foreground/60 ml-1">
              已选 {selectedFiles.length}/{files?.length || 0} 个文件，共 {formatBytes(selectedSize)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 font-medium text-foreground cursor-pointer select-none">
              <Checkbox
                checked={videoOnly}
                onCheckedChange={(checked) => handleSelectVideos(checked === true)}
              />
              <Film className="size-3.5 text-primary/70" />
              <span>视频</span>
            </label>
            <div className="h-4 w-px bg-border/80" />
            <List className="size-4 text-muted-foreground/60" />
          </div>
        </div>

        {/* Tree Container */}
        <ScrollArea className="h-[260px] p-2" scrollbar="thin">
          {tree ? (
            renderNode(tree, 0)
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              无可用文件
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Options & sequential download */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
          <Checkbox
            checked={sequential}
            onCheckedChange={(checked) => onSequentialChange(checked === true)}
          />
          <span>启用列表顺序下载</span>
        </label>
      </div>

      {/* Category Dropdown Selection & Download Directory Selector */}
      <div className="grid gap-4 md:grid-cols-2 pt-1">
        {/* Category Dropdown Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between h-5">
            <label className="block text-xs font-semibold text-foreground/80">分类到</label>
          </div>
          <CategoryDropdown
            categories={categories}
            value={categoryId}
            onValueChange={onCategoryChange}
            disabled={loading}
            noCategoryLabel="不分类"
            triggerClassName="h-12 bg-background/70 px-4 text-base w-full"
          />
        </div>

        {/* Download Directory Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between h-5">
            <label className="block text-xs font-semibold text-foreground/80">下载到</label>
            <span className="text-xs text-muted-foreground/60 font-mono">
              剩余: 454.0 GB
            </span>
          </div>
          <ActionInput
            type="text"
            value={savePath}
            onChange={(event) => onSavePathChange(event.target.value)}
            disabled={loading}
            leadingIcon={<HardDrive />}
            actionIcon={<FolderOpen />}
            actionLabel="选择下载目录"
            onAction={onPickSaveDirectory}
            inputClassName="font-mono"
          />
        </div>
      </div>
    </div>
  )
}
