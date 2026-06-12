import { useCallback, useEffect, useMemo, useState, useRef, type FormEvent } from "react"

import {
  checkFileConflict,
  createTask,
  getDiskSpace,
  inspectDownloadMetadata,
  pickDownloadDirectory,
  pickTorrentFile,
  previewTaskClassification,
  readClipboardText,
  type FileConflictCheck,
  type TorrentFileInspection,
} from "@/core/bridge/tauri-commands"
import type { ExternalDownloadRequest } from "@/core/bridge/external-download"
import { UI_TEXT } from "@/core/locale"
import { useAppSettingsStore } from "@/core/store/useAppSettingsStore"
import { useDownloadStore } from "@/core/store/useDownloadStore"
import { useToastStore } from "@/core/store/useToastStore"
import {
  buildAdvancedOptions,
  DEFAULT_TASK_THREAD_COUNT,
  inferFileName,
  parseCookieInput,
  formatBytes,
} from "./data"
import type { NewTaskAdvancedDraft, NewTaskDetailsTab, NewTaskStep, PendingTaskCreate } from "./types"

interface UseNewTaskModalStateProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRequest?: ExternalDownloadRequest | null
  onInitialRequestConsumed?: () => void
}

export function useNewTaskModalState({
  open,
  onOpenChange,
  initialRequest,
  onInitialRequestConsumed,
}: UseNewTaskModalStateProps) {
  const [step, setStep] = useState<NewTaskStep>("link")
  const [detailsTab, setDetailsTab] = useState<NewTaskDetailsTab>("basic")
  const [url, setUrl] = useState("")
  const [filename, setFilename] = useState("")
  const [savePath, setSavePath] = useState("")
  const savePathIsManual = useRef(false)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [advancedDraft, setAdvancedDraft] = useState<NewTaskAdvancedDraft>({
    maxDownloadSpeedInput: "",
    maxUploadSpeedInput: "",
    taskThreadCountInput: "",
    userAgentInput: "",
    refererInput: "",
    cookiesInput: "",
    autoVerify: true,
    disableDhtPexLpd: false,
    fileAllocation: "default",
  })
  const [previewTagIds, setPreviewTagIds] = useState<number[]>([])
  const [totalSize, setTotalSize] = useState<number | null>(null)
  const [metadataLoading, setMetadataLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [conflictCheck, setConflictCheck] = useState<FileConflictCheck | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [pendingTaskCreate, setPendingTaskCreate] = useState<PendingTaskCreate | null>(null)
  const [isTorrent, setIsTorrent] = useState(false)
  const [torrentFiles, setTorrentFiles] = useState<TorrentFileInspection[] | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<number[]>([])
  const [sequential, setSequential] = useState(false)
  const [infoHash, setInfoHash] = useState<string | null>(null)
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null)

  const [diskSpace, setDiskSpace] = useState<{ free: number; total: number } | null>(null)
  const [formConflict, setFormConflict] = useState<FileConflictCheck | null>(null)

  // Reset overwrite when filename or savePath changes
  useEffect(() => {
    setOverwrite(false)
  }, [savePath, filename])

  // Query disk space whenever savePath changes
  useEffect(() => {
    if (!savePath.trim()) {
      setDiskSpace(null)
      return
    }

    let active = true
    const fetchSpace = async () => {
      try {
        const [free, total] = await getDiskSpace(savePath.trim())
        if (active) {
          setDiskSpace({ free, total })
        }
      } catch (err) {
        console.error("Failed to query disk space:", err)
      }
    }

    fetchSpace()
    return () => {
      active = false
    }
  }, [savePath])

  // Debounced proactive conflict checking
  useEffect(() => {
    if (!savePath || !filename) {
      setFormConflict(null)
      return
    }

    let active = true
    const check = async () => {
      try {
        const res = await checkFileConflict(savePath, filename)
        if (active) {
          setFormConflict(res)
        }
      } catch (err) {
        console.error("Error checking file conflict:", err)
      }
    }

    const timer = setTimeout(check, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [savePath, filename])

  const selectedSize = useMemo(() => {
    if (isTorrent && torrentFiles) {
      return selectedFiles.reduce((acc, index) => acc + (torrentFiles[index]?.size || 0), 0)
    }
    return totalSize
  }, [isTorrent, torrentFiles, selectedFiles, totalSize])

  const isDiskSpaceWarning = useMemo(() => {
    if (selectedSize === null || !diskSpace) return false
    return selectedSize > diskSpace.free
  }, [selectedSize, diskSpace])

  const freeSpaceText = useMemo(() => {
    return diskSpace ? formatBytes(diskSpace.free) : "--"
  }, [diskSpace])

  const tags = useDownloadStore((state) => state.tags)
  const categories = useDownloadStore((state) => state.categories)
  const pushToast = useToastStore((state) => state.pushToast)
  const settings = useAppSettingsStore((state) => state.settings)
  const loadSettings = useAppSettingsStore((state) => state.load)
  const globalSaveDir = settings?.download.default_save_dir ?? ""
  const globalUserAgent = settings?.download.global_user_agent ?? ""
  const defaultThreadCount = settings?.transfer.task_thread_count ?? DEFAULT_TASK_THREAD_COUNT

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId]
  )
  const matchedTag = useMemo(
    () => tags.find((tag) => previewTagIds.includes(tag.id)) ?? null,
    [previewTagIds, tags]
  )
  const ruleLabel = matchedTag?.name ?? selectedCategory?.name ?? "未分类"

  const updateAdvancedDraft = useCallback((patch: Partial<NewTaskAdvancedDraft>) => {
    setAdvancedDraft((current) => ({ ...current, ...patch }))
  }, [])

  const applyClassificationPreview = useCallback(async (
    nextUrl: string,
    nextFilename: string,
    nextTotalSize: number | null,
    nextCategoryId: number | null,
    overrideCategory: boolean,
    options?: { touchPath?: boolean }
  ) => {
    const preview = await previewTaskClassification(
      nextUrl,
      nextFilename,
      nextTotalSize,
      nextCategoryId,
      overrideCategory
    )

    setCategoryId(preview.category?.id ?? null)
    setPreviewTagIds(preview.tags.map((tag) => tag.id))
    if (options?.touchPath !== false) {
      savePathIsManual.current = false
      setSavePath(preview.save_path || globalSaveDir)
    }
  }, [globalSaveDir])

  const resetForm = useCallback(() => {
    savePathIsManual.current = false
    setStep("link")
    setDetailsTab("basic")
    setUrl("")
    setFilename("")
    setSavePath("")
    setCategoryId(null)
    setCategoryTouched(false)
    setAdvancedDraft({
      maxDownloadSpeedInput: "",
      maxUploadSpeedInput: "",
      taskThreadCountInput: "",
      userAgentInput: "",
      refererInput: "",
      cookiesInput: "",
      autoVerify: true,
      disableDhtPexLpd: false,
      fileAllocation: "default",
    })
    setPreviewTagIds([])
    setTotalSize(null)
    setMetadataLoading(false)
    setLoading(false)
    setConflictCheck(null)
    setPendingTaskCreate(null)
    setIsTorrent(false)
    setTorrentFiles(null)
    setSelectedFiles([])
    setSequential(false)
    setInfoHash(null)
    setIsPrivate(null)
  }, [])

  const closeModal = useCallback(() => {
    resetForm()
    onOpenChange(false)
  }, [onOpenChange, resetForm])

  useEffect(() => {
    if (settings || !open) return
    loadSettings().catch(console.error)
  }, [loadSettings, open, settings])

  useEffect(() => {
    if (!open) return
    useDownloadStore.getState().fetchCategoryTree().catch(console.error)
  }, [open])

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await readClipboardText()
      if (text.trim()) setUrl(text.trim())
    } catch (err) {
      console.error("Failed to read clipboard:", err)
      pushToast({
        title: "读取剪贴板失败",
        description: String(err),
        variant: "warning",
      })
    }
  }, [pushToast])

  const handleSavePathChange = useCallback((value: string) => {
    savePathIsManual.current = true
    setSavePath(value)
  }, [])

  const pickSaveDirectory = useCallback(async () => {
    try {
      const directory = await pickDownloadDirectory(savePath.trim() || globalSaveDir || undefined)
      if (directory) {
        savePathIsManual.current = true
        setSavePath(directory)
      }
    } catch (err) {
      console.error("Failed to pick download directory:", err)
      pushToast({
        title: "选择目录失败",
        description: String(err),
        variant: "warning",
      })
    }
  }, [globalSaveDir, pushToast, savePath])

  const inspectMetadata = useCallback(async (
    nextUrl: string,
    fallbackFilename: string,
    userAgent?: string,
    referer?: string,
    cookies?: string[]
  ) => {
    setMetadataLoading(true)
    setTotalSize(null)
    setIsTorrent(false)
    setTorrentFiles(null)
    setSelectedFiles([])
    setInfoHash(null)
    setIsPrivate(null)

    try {
      const ua = userAgent?.trim() || advancedDraft.userAgentInput.trim() || undefined
      const ref = referer?.trim() || advancedDraft.refererInput.trim() || undefined
      const cookiesArr = cookies ?? parseCookieInput(advancedDraft.cookiesInput)

      const metadata = await inspectDownloadMetadata(nextUrl, ua, ref, cookiesArr)
      const nextFilename = metadata.filename?.trim() || fallbackFilename
      const nextTotalSize = metadata.total_size ?? null

      setFilename(nextFilename)
      setTotalSize(nextTotalSize)
      setIsTorrent(metadata.is_torrent)
      setTorrentFiles(metadata.files)
      setInfoHash(metadata.info_hash || null)
      setIsPrivate(metadata.is_private ?? null)

      if (metadata.is_torrent && metadata.is_private) {
        setAdvancedDraft((current) => ({
          ...current,
          disableDhtPexLpd: true,
        }))
      }

      if (metadata.is_torrent && metadata.files) {
        setSelectedFiles(metadata.files.map((_, i) => i))
      }
      await applyClassificationPreview(nextUrl, nextFilename, nextTotalSize, null, false)
    } catch (err) {
      console.warn("Failed to inspect download metadata:", err)
      setTotalSize(null)
    } finally {
      setMetadataLoading(false)
    }
  }, [applyClassificationPreview, advancedDraft])

  const openDetailsDraft = useCallback((
    nextUrl: string,
    fallbackFilename: string,
    nextTotalSize: number | null,
    options?: {
      inspectMetadata?: boolean
      userAgent?: string
      referer?: string
      cookies?: string[]
    }
  ) => {
    savePathIsManual.current = false
    setUrl(nextUrl)
    setFilename(fallbackFilename)
    setTotalSize(nextTotalSize === null || nextTotalSize <= 0 ? null : nextTotalSize)
    setCategoryTouched(false)
    setMetadataLoading(false)
    setLoading(false)
    setDetailsTab("basic")
    setInfoHash(null)
    setIsPrivate(null)
    setAdvancedDraft((current) => ({
      ...current,
      taskThreadCountInput: String(defaultThreadCount),
      maxUploadSpeedInput: "",
      autoVerify: true,
      disableDhtPexLpd: false,
      userAgentInput: options?.userAgent ?? current.userAgentInput,
      refererInput: options?.referer ?? current.refererInput,
      cookiesInput: options?.cookies?.join("\n") ?? current.cookiesInput,
    }))
    applyClassificationPreview(nextUrl, fallbackFilename, nextTotalSize, null, false).catch(console.error)
    setStep("details")

    if (options?.inspectMetadata !== false) {
      inspectMetadata(
        nextUrl,
        fallbackFilename,
        options?.userAgent,
        options?.referer,
        options?.cookies
      ).catch(console.error)
    }
  }, [applyClassificationPreview, defaultThreadCount, inspectMetadata])

  const pickTorrentFileAction = useCallback(async () => {
    try {
      const file = await pickTorrentFile()
      if (file) {
        setUrl(file)
        const nextFilename = file.split(/[/\\]/).pop() || "torrent"
        openDetailsDraft(file, nextFilename, null, { inspectMetadata: true })
      }
    } catch (err) {
      console.error("Failed to pick torrent file:", err)
      pushToast({
        title: "选择种子文件失败",
        description: String(err),
        variant: "warning",
      })
    }
  }, [openDetailsDraft, pushToast])

  useEffect(() => {
    if (!open || !initialRequest) return

    let cancelled = false
    window.queueMicrotask(() => {
      if (cancelled) return

      const nextUrl = initialRequest.url.trim()
      if (!nextUrl) {
        onInitialRequestConsumed?.()
        return
      }

      const nextFilename = initialRequest.filename?.trim() || inferFileName(nextUrl)
      const nextTotalSize = initialRequest.totalSize ?? null

      if (initialRequest.userAgent || initialRequest.referer || initialRequest.cookies) {
        setAdvancedDraft((current) => ({
          ...current,
          userAgentInput: initialRequest.userAgent || current.userAgentInput,
          refererInput: initialRequest.referer || current.refererInput,
          cookiesInput: initialRequest.cookies?.join("\n") || current.cookiesInput,
        }))
      }

      const isBt = nextUrl.toLowerCase().startsWith("magnet:") ||
        nextUrl.toLowerCase().includes(".torrent") ||
        nextUrl.toLowerCase().startsWith("torrent:")

      openDetailsDraft(nextUrl, nextFilename, nextTotalSize, {
        inspectMetadata: nextTotalSize === null || nextTotalSize <= 0 || isBt,
        userAgent: initialRequest.userAgent || undefined,
        referer: initialRequest.referer || undefined,
        cookies: initialRequest.cookies || undefined,
      })
      onInitialRequestConsumed?.()
    })

    return () => {
      cancelled = true
    }
  }, [initialRequest, onInitialRequestConsumed, open, openDetailsDraft])

  const prepareDetails = useCallback(() => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) return

    openDetailsDraft(trimmedUrl, inferFileName(trimmedUrl), null)
  }, [openDetailsDraft, url])

  const handleCategoryChange = useCallback((nextCategoryId: number | null) => {
    setCategoryId(nextCategoryId)
    setCategoryTouched(true)
    applyClassificationPreview(
      url.trim(),
      filename.trim() || inferFileName(url.trim()),
      totalSize,
      nextCategoryId,
      true
    ).catch(console.error)
  }, [applyClassificationPreview, filename, totalSize, url])

  const submitTaskCreate = useCallback(async (task: PendingTaskCreate, overwrite = false) => {
    setLoading(true)
    try {
      await createTask(
        task.url,
        task.savePath || undefined,
        task.filename,
        task.categoryId,
        task.categoryTouched,
        task.totalSize,
        overwrite,
        task.advancedOptions,
        task.selectedFiles,
        task.sequential
      )

      if (savePathIsManual.current && task.savePath) {
        savePathToHistory(task.savePath)
      }

      await useDownloadStore.getState().fetchTasks()
      closeModal()
    } catch (err) {
      console.error("Failed to create download task:", err)
      alert(UI_TEXT.newTask.errorAlert)
    } finally {
      setLoading(false)
    }
  }, [closeModal])

  const handleCreateTask = useCallback(async () => {
    if (!url.trim()) return

    setLoading(true)
    try {
      const nextTask: PendingTaskCreate = {
        url: url.trim(),
        savePath: savePath.trim() || globalSaveDir,
        filename: filename.trim() || inferFileName(url.trim()),
        categoryId,
        categoryTouched,
        totalSize,
        advancedOptions: buildAdvancedOptions(advancedDraft),
        selectedFiles: isTorrent ? selectedFiles : undefined,
        sequential: isTorrent ? sequential : undefined,
      }

      const conflict = await checkFileConflict(nextTask.savePath, nextTask.filename)
      if (conflict.exists && !overwrite) {
        setPendingTaskCreate(nextTask)
        setConflictCheck(conflict)
        setLoading(false)
        return
      }

      await submitTaskCreate(nextTask, overwrite)
    } catch (err) {
      console.error("Failed to create download task:", err)
      alert(UI_TEXT.newTask.errorAlert)
    } finally {
      setLoading(false)
    }
  }, [
    advancedDraft,
    categoryId,
    categoryTouched,
    filename,
    globalSaveDir,
    isTorrent,
    overwrite,
    savePath,
    selectedFiles,
    sequential,
    submitTaskCreate,
    totalSize,
    url,
  ])

  const handleUseSuggestedFilename = useCallback(() => {
    if (!pendingTaskCreate || !conflictCheck) return

    const nextTask = {
      ...pendingTaskCreate,
      filename: conflictCheck.suggested_filename,
    }

    setFilename(conflictCheck.suggested_filename)
    setConflictCheck(null)
    setPendingTaskCreate(null)
    submitTaskCreate(nextTask).catch(console.error)
  }, [conflictCheck, pendingTaskCreate, submitTaskCreate])

  const handleOverwriteExistingFile = useCallback(() => {
    if (!pendingTaskCreate) return

    const nextTask = pendingTaskCreate
    setConflictCheck(null)
    setPendingTaskCreate(null)
    submitTaskCreate(nextTask, true).catch(console.error)
  }, [pendingTaskCreate, submitTaskCreate])

  const handleRenameManually = useCallback(() => {
    setConflictCheck(null)
    setPendingTaskCreate(null)
  }, [])

  const handleSubmit = useCallback((event: FormEvent) => {
    event.preventDefault()
    if (step === "link") {
      prepareDetails()
      return
    }

    handleCreateTask().catch(console.error)
  }, [handleCreateTask, prepareDetails, step])

  const retryMetadataProbe = useCallback(() => {
    if (url.trim()) {
      inspectMetadata(url.trim(), filename.trim() || inferFileName(url.trim())).catch(console.error)
    }
  }, [inspectMetadata, url, filename])

  const savePathHistory = useMemo(() => {
    return getPathHistory()
  }, [savePath])

  return {
    state: {
      step,
      detailsTab,
      url,
      filename,
      savePath,
      categoryId,
      advancedDraft,
      totalSize,
      metadataLoading,
      loading,
      conflictCheck,
      isTorrent,
      torrentFiles,
      selectedFiles,
      sequential,
      infoHash,
      isPrivate,
      freeSpaceText,
      isDiskSpaceWarning,
      formConflict,
      savePathHistory,
      overwrite,
    },
    data: {
      categories,
      selectedCategory,
      matchedTag,
      ruleLabel,
      defaultThreadCount,
      globalUserAgent,
    },
    actions: {
      closeModal,
      handleSubmit,
      setDetailsTab,
      setUrl,
      setFilename,
      setSavePath: handleSavePathChange,
      handleCategoryChange,
      updateAdvancedDraft,
      pasteFromClipboard,
      pickSaveDirectory,
      pickTorrentFile: pickTorrentFileAction,
      setSelectedFiles,
      setSequential,
      handleUseSuggestedFilename,
      handleOverwriteExistingFile,
      handleRenameManually,
      retryMetadataProbe,
      setOverwrite,
    },
  }
}

function savePathToHistory(path: string) {
  const trimmed = path.trim()
  if (!trimmed) return
  try {
    const raw = localStorage.getItem("pidown_savepath_history")
    const history: string[] = raw ? JSON.parse(raw) : []
    const nextHistory = [trimmed, ...history.filter((p) => p !== trimmed)].slice(0, 5)
    localStorage.setItem("pidown_savepath_history", JSON.stringify(nextHistory))
  } catch (e) {
    console.error("Failed to save path history:", e)
  }
}

export function getPathHistory(): string[] {
  try {
    const raw = localStorage.getItem("pidown_savepath_history")
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
