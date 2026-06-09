import type { NewTaskDetailsTab } from "./types"
import { cn } from "@/lib/utils"

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
      <div className="grid h-10 min-w-60 grid-cols-2 items-center rounded-lg bg-muted p-1 text-sm text-muted-foreground">
        <button
          type="button"
          aria-pressed={value === "basic"}
          className={cn(
            "flex h-8 items-center justify-center rounded-md px-4 font-medium transition",
            value === "basic" ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
          )}
          onClick={() => onValueChange("basic")}
        >
          基础信息
        </button>
        <button
          type="button"
          aria-pressed={value === "advanced"}
          className={cn(
            "flex h-8 items-center justify-center rounded-md px-4 font-medium transition",
            value === "advanced" ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
          )}
          onClick={() => onValueChange("advanced")}
        >
          高级设置
        </button>
      </div>
    </div>
  )
}
