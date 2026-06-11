import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"

import {
  checkFileConflict,
  createTask,
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
  })
  const [previewTagIds, setPreviewTagIds] = useState<number[]>([])
  const [totalSize, setTotalSize] = useState<number | null>(null)
  const [metadataLoading, setMetadataLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [conflictCheck, setConflictCheck] = useState<FileConflictCheck | null>(null)
  const [pendingTaskCreate, setPendingTaskCreate] = useState<PendingTaskCreate | null>(null)
  const [isTorrent, setIsTorrent] = useState(false)
  const [torrentFiles, setTorrentFiles] = useState<TorrentFileInspection[] | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<number[]>([])
  const [sequential, setSequential] = useState(false)
  const [infoHash, setInfoHash] = useState<string | null>(null)
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null)

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
      setSavePath(preview.save_path || globalSaveDir)
    }
  }, [globalSaveDir])

  const resetForm = useCallback(() => {
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

  const pickSaveDirectory = useCallback(async () => {
    try {
      const directory = await pickDownloadDirectory(savePath.trim() || globalSaveDir || undefined)
      if (directory) setSavePath(directory)
    } catch (err) {
      console.error("Failed to pick download directory:", err)
      pushToast({
        title: "选择目录失败",
        description: String(err),
        variant: "warning",
      })
    }
  }, [globalSaveDir, pushToast, savePath])

  const inspectMetadata = useCallback(async (nextUrl: string, fallbackFilename: string) => {
    setMetadataLoading(true)
    setTotalSize(null)
    setIsTorrent(false)
    setTorrentFiles(null)
    setSelectedFiles([])
    setInfoHash(null)
    setIsPrivate(null)

    try {
      const metadata = await inspectDownloadMetadata(nextUrl)
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
  }, [applyClassificationPreview])

  const openDetailsDraft = useCallback((
    nextUrl: string,
    fallbackFilename: string,
    nextTotalSize: number | null,
    options?: { inspectMetadata?: boolean }
  ) => {
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
    }))
    applyClassificationPreview(nextUrl, fallbackFilename, nextTotalSize, null, false).catch(console.error)
    setStep("details")

    if (options?.inspectMetadata !== false) {
      inspectMetadata(nextUrl, fallbackFilename).catch(console.error)
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
      if (conflict.exists) {
        setPendingTaskCreate(nextTask)
        setConflictCheck(conflict)
        setLoading(false)
        return
      }

      await submitTaskCreate(nextTask)
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
      setSavePath,
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
    },
  }
}
