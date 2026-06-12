import { useState, useMemo, useEffect, useRef } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen, HardDrive, Film, List, Magnet } from "lucide-react"

import { CategoryDropdown } from "@/components/common/CategoryDropdown"
import { FileIcon } from "@/components/common/FileIcon"
import { CompoundInput, CompoundInputButton } from "@/components/ui/input"
import type { Category } from "@/core/store/useDownloadStore"
import type { FileConflictCheck } from "@/core/bridge/tauri-commands"
import { formatBytes } from "./data"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { UI_TEXT } from "@/core/locale"

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
  freeSpaceText?: string
  isDiskSpaceWarning?: boolean
  formConflict?: FileConflictCheck | null
  onFilenameChange?: (value: string) => void
  savePathHistory?: string[]
  overwrite: boolean
  onOverwriteChange: (value: boolean) => void
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
  freeSpaceText,
  isDiskSpaceWarning,
  formConflict,
  onFilenameChange,
  savePathHistory = [],
  overwrite,
  onOverwriteChange,
}: NewTaskBtFormProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [videoOnly, setVideoOnly] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Memoize tree representation
  const tree = useMemo(() => {
    if (!files || files.length === 0) return null
    return buildTree(files)
  }, [files])

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  // Listen to custom scroll event of ScrollArea viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const viewport = el.querySelector('[data-slot="scroll-area-viewport"]')
    if (!viewport) return

    const handleScroll = (e: Event) => {
      setScrollTop((e.target as HTMLElement).scrollTop)
    }

    viewport.addEventListener("scroll", handleScroll)
    return () => {
      viewport.removeEventListener("scroll", handleScroll)
    }
  }, [])

  interface FlatNode {
    node: TreeNode
    depth: number
  }

  // Flatten the tree into an array of visible nodes
  const visibleNodes = useMemo(() => {
    if (!tree) return []
    const flat: FlatNode[] = []

    function traverse(node: TreeNode, depth: number) {
      if (node.path === "") {
        node.children.forEach((child) => traverse(child, depth))
        return
      }

      flat.push({ node, depth })

      if (node.isFolder && expandedFolders[node.path]) {
        node.children.forEach((child) => traverse(child, depth + 1))
      }
    }

    traverse(tree, 0)
    return flat
  }, [tree, expandedFolders])

  const ROW_HEIGHT = 36
  const VIEWPORT_HEIGHT = 180 // Reduced height to 180px
  const OVERSCAN = 5

  const totalHeight = visibleNodes.length * ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(visibleNodes.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN)

  const visibleSlice = visibleNodes.slice(startIndex, endIndex)
  const topSpacerHeight = startIndex * ROW_HEIGHT



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

  // Render flat node in the virtual list
  const renderFlatNode = (node: TreeNode, depth: number) => {
    const indent = depth * 18

    if (node.isFolder) {
      const isExpanded = expandedFolders[node.path]
      const selectState = getFolderSelectState(node)

      return (
        <div
          key={node.path}
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
              <FileIcon filename={node.name} className="size-4" />
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
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary select-none">
          <Magnet className="size-6 rotate-45" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground truncate max-w-[400px]">
            {filename}
          </div>
          <div className="text-xs text-muted-foreground/80 mt-0.5">
            {UI_TEXT.newTask.bt.selectedFilesText
              .replace("{{count}}", String(selectedFiles.length))
              .replace("{{total}}", String(files?.length || 0))
              .replace("{{size}}", formatBytes(selectedSize))}
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
              {UI_TEXT.newTask.bt.selectAll}
            </label>
            <span className="text-muted-foreground/60 ml-1">
              {UI_TEXT.newTask.bt.selectedFilesSummary
                .replace("{{count}}", String(selectedFiles.length))
                .replace("{{total}}", String(files?.length || 0))
                .replace("{{size}}", formatBytes(selectedSize))}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 font-medium text-foreground cursor-pointer select-none">
              <Checkbox
                checked={videoOnly}
                onCheckedChange={(checked) => handleSelectVideos(checked === true)}
              />
              <Film className="size-3.5 text-primary/70" />
              <span>{UI_TEXT.newTask.bt.video}</span>
            </label>
            <div className="h-4 w-px bg-border/80" />
            <List className="size-4 text-muted-foreground/60" />
          </div>
        </div>

        {/* Tree Container */}
        <ScrollArea ref={containerRef} className="h-[180px] p-2" scrollbar="overlay">
          {tree && visibleNodes.length > 0 ? (
            <div className="relative" style={{ height: totalHeight }}>
              <div style={{ height: topSpacerHeight }} aria-hidden="true" />
              {visibleSlice.map(({ node, depth }) => renderFlatNode(node, depth))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {UI_TEXT.newTask.bt.noFiles}
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
          <span>{UI_TEXT.newTask.bt.sequential}</span>
        </label>
      </div>

      {/* Category Dropdown Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between h-5">
          <label className="block text-xs font-semibold text-foreground/80">{UI_TEXT.newTask.categorizeTo}</label>
        </div>
        <CategoryDropdown
          categories={categories}
          value={categoryId}
          onValueChange={onCategoryChange}
          disabled={loading}
          noCategoryLabel={UI_TEXT.newTask.noCategory}
          triggerClassName="h-12 bg-background/70 px-4 text-base w-full"
        />
      </div>

      {/* Download Directory Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between h-5">
          <label className="block text-xs font-semibold text-foreground/80">{UI_TEXT.newTask.downloadTo}</label>
          <span className={cn(
            "text-xs font-mono transition-colors duration-200",
            isDiskSpaceWarning
              ? "text-destructive font-semibold animate-pulse"
              : "text-muted-foreground/60"
          )}>
            {UI_TEXT.newTask.freeSpace.replace("{{size}}", freeSpaceText)} {isDiskSpaceWarning && UI_TEXT.newTask.diskSpaceWarning}
          </span>
        </div>
        <div className="relative">
          <CompoundInput
            type="text"
            size="lg"
            value={savePath}
            onChange={(event) => onSavePathChange(event.target.value)}
            onFocus={() => setShowHistory(true)}
            onClick={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            disabled={loading}
            inputClassName="font-mono"
            prefixActions={
              <div
                className="grid w-12 h-full place-items-center border-r border-border/70 text-muted-foreground transition-colors group-focus-within:text-primary [&_svg]:size-5"
                aria-hidden="true"
              >
                <HardDrive />
              </div>
            }
            suffixActions={
              <CompoundInputButton
                type="button"
                size="lg"
                divider="left"
                onClick={onPickSaveDirectory}
                disabled={loading}
                aria-label={UI_TEXT.newTask.bt.selectSaveDir}
              >
                <FolderOpen className="mr-1.5" />
                {UI_TEXT.settings.browse}
              </CompoundInputButton>
            }
          />
          {showHistory && savePathHistory && savePathHistory.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
              {savePathHistory.map((path, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent input blur before onClick fires
                    e.preventDefault()
                  }}
                  onClick={() => {
                    onSavePathChange(path)
                    setShowHistory(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground font-mono transition-colors"
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {formConflict && formConflict.exists && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive flex flex-col gap-2 mt-1.5 text-left">
            <div className="flex items-center gap-1.5 font-semibold">
              <span>{UI_TEXT.newTask.conflict.warning}</span>
            </div>
            <div className="font-mono break-all text-muted-foreground/80">
              {UI_TEXT.newTask.conflict.suggestedName}<span className="text-foreground font-semibold">{formConflict.suggested_filename}</span>
            </div>
            <div className="flex items-center gap-4 mt-1">
              {onFilenameChange && (
                <button
                  type="button"
                  className="px-2.5 py-1 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold transition-colors"
                  onClick={() => onFilenameChange(formConflict.suggested_filename)}
                >
                  {UI_TEXT.newTask.conflict.useSuggested}
                </button>
              )}
              <label className="flex items-center gap-1.5 text-xs text-destructive cursor-pointer select-none font-semibold">
                <Checkbox
                  checked={overwrite}
                  onCheckedChange={(checked) => onOverwriteChange(checked === true)}
                />
                <span>{UI_TEXT.newTask.conflict.overwriteCheckbox}</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
