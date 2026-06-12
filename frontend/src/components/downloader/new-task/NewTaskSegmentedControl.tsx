import type { NewTaskDetailsTab } from "./types"
import { cn } from "@/lib/utils"
import { motion } from "motion/react"

interface NewTaskSegmentedControlProps {
  value: NewTaskDetailsTab
  onValueChange: (value: NewTaskDetailsTab) => void
}

export function NewTaskSegmentedControl({
  value,
  onValueChange,
}: NewTaskSegmentedControlProps) {
  return (
    <div className="flex h-10 w-full items-center justify-center">
      <div className="relative grid h-10 min-w-60 grid-cols-2 items-center rounded-lg bg-muted p-1 text-sm text-muted-foreground">
        <button
          type="button"
          aria-pressed={value === "basic"}
          className={cn(
            "relative flex h-8 items-center justify-center rounded-md px-4 font-medium transition-colors cursor-pointer select-none",
            value === "basic" ? "text-foreground" : "hover:text-foreground text-muted-foreground"
          )}
          onClick={() => onValueChange("basic")}
        >
          {value === "basic" && (
            <motion.div
              layoutId="newTaskSegmentedActive"
              className="absolute inset-0 rounded-md bg-background shadow-sm"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">基础信息</span>
        </button>
        <button
          type="button"
          aria-pressed={value === "advanced"}
          className={cn(
            "relative flex h-8 items-center justify-center rounded-md px-4 font-medium transition-colors cursor-pointer select-none",
            value === "advanced" ? "text-foreground" : "hover:text-foreground text-muted-foreground"
          )}
          onClick={() => onValueChange("advanced")}
        >
          {value === "advanced" && (
            <motion.div
              layoutId="newTaskSegmentedActive"
              className="absolute inset-0 rounded-md bg-background shadow-sm"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">高级设置</span>
        </button>
      </div>
    </div>
  )
}

