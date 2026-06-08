import type { ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export interface OptionDropdownOption<TValue extends string = string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

interface OptionDropdownProps<TValue extends string = string> {
  value: TValue;
  options: OptionDropdownOption<TValue>[];
  onValueChange: (value: TValue) => void;
  onOpenChange?: (open: boolean) => void;
  placeholder?: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  emptyContent?: ReactNode;
  contentFooter?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  size?: "sm" | "default" | "lg";
}

export function OptionDropdown<TValue extends string = string>({
  value,
  options,
  onValueChange,
  onOpenChange,
  placeholder,
  triggerClassName,
  contentClassName,
  emptyContent,
  contentFooter,
  ariaLabel,
  disabled,
  size,
}: OptionDropdownProps<TValue>) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as TValue)}
      onOpenChange={onOpenChange}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={triggerClassName} aria-label={ariaLabel}>
        <span className="min-w-0 truncate">{selectedOption?.label ?? placeholder}</span>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.length
          ? options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))
          : emptyContent}
        {contentFooter}
      </SelectContent>
    </Select>
  );
}
