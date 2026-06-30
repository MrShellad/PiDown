import React from "react";
import { useThemeStore } from "@/core/store/useThemeStore";
import { Button as AnimalButton, Switch as AnimalSwitch } from "animal-island-ui";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Interface for standard button props in our app
export interface StandardButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  variant?: string | null;
  size?: string | null;
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  noTheme?: boolean;
}

// Interface for standard switch props in our app
export interface StandardSwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: "sm" | "default" | "lg" | null;
}

export function useThemeButton(
  props: StandardButtonProps,
  defaultRender: () => React.ReactElement
): React.ReactElement {
  const theme = useThemeStore((state) => state.theme);

  if (theme === "animal-crossing" && !props.asChild && !props.noTheme) {
    const { type: htmlType, variant, size, loading, loadingText, leftIcon, rightIcon, disabled, children, className, ...rest } = props;
    let animalType: "primary" | "default" | "dashed" | "text" | "link" = "default";
    let danger = false;
    if (variant === "default" || variant === "primary") animalType = "primary";
    else if (variant === "outline") animalType = "primary"; // Map outline to 3D primary beige!
    else if (variant === "secondary") animalType = "default";
    else if (variant === "dashed") animalType = "dashed";
    else if (variant === "ghost") animalType = "text";
    else if (variant === "text") animalType = "text";
    else if (variant === "destructive") {
      animalType = "primary";
      danger = true;
    }
    else if (variant === "link") animalType = "link";

    let animalSize: "small" | "middle" | "large" = "middle";
    if (size === "xs" || size === "sm" || size === "icon" || size === "icon-xs" || size === "icon-sm") {
      animalSize = "small";
    } else if (size === "lg" || size === "icon-lg") {
      animalSize = "large";
    }

    // Automatically extract icon from children if not explicitly provided as leftIcon
    let resolvedLeftIcon = leftIcon;
    let resolvedChildren = children;

    if (!resolvedLeftIcon && children) {
      const elements = React.Children.toArray(children);
      const iconIndex = elements.findIndex(
        (child) =>
          React.isValidElement(child) &&
          (typeof child.type !== "string" || child.type === "svg")
      );
      if (iconIndex !== -1) {
        resolvedLeftIcon = elements[iconIndex];
        resolvedChildren = React.createElement(
          React.Fragment,
          null,
          ...elements.filter((_, idx) => idx !== iconIndex)
        );
      }
    }

    // Normalize icon buttons to be square and clear padding
    let resolvedStyle = rest.style || {};
    let resolvedClassName = className;

    if (size && (size.includes("icon") || size === "icon")) {
      let sizeVal = "32px"; // default small height
      if (size === "icon-xs") sizeVal = "24px";
      else if (size === "icon-sm") sizeVal = "28px";
      else if (size === "icon-lg") sizeVal = "40px";
      else if (size === "icon") sizeVal = "32px";

      resolvedStyle = {
        ...resolvedStyle,
        width: sizeVal,
        minWidth: sizeVal,
        height: sizeVal,
        minHeight: sizeVal,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      };
      resolvedClassName = cn(resolvedClassName, "p-0 flex items-center justify-center");

      // Extract screen reader text from children as aria-label and set children to null
      // only if the button actually contains a resolved icon to prevent erasing pagination page numbers
      if (resolvedLeftIcon) {
        let ariaLabel = (props as any)["aria-label"];
        if (!ariaLabel && children) {
          const getText = (node: any): string => {
            if (!node) return "";
            if (typeof node === "string" || typeof node === "number") return String(node);
            if (Array.isArray(node)) return node.map(getText).join("");
            if (React.isValidElement(node)) return getText((node as any).props.children);
            return "";
          };
          const text = getText(children).trim();
          if (text) {
            ariaLabel = text;
          }
        }
        resolvedChildren = null;
        (rest as any)["aria-label"] = ariaLabel;
      }
    }

    const buttonProps = {
      ...rest,
      style: resolvedStyle,
      "data-slot": "button",
    };

    let finalChildren = loading && loadingText ? loadingText : resolvedChildren;
    if (rightIcon) {
      finalChildren = (
        <>
          {finalChildren}
          <span className="ml-1.5">{rightIcon}</span>
        </>
      );
    }

    return (
      <AnimalButton
        type={animalType}
        htmlType={htmlType as any}
        size={animalSize}
        danger={danger}
        disabled={disabled || loading}
        className={resolvedClassName}
        icon={loading ? <LoaderCircle className="animate-spin" /> : resolvedLeftIcon}
        {...(buttonProps as any)}
        children={finalChildren || undefined}
      />
    );
  }

  return defaultRender();
}

export function useThemeSwitch(
  props: StandardSwitchProps,
  defaultRender: () => React.ReactElement
): React.ReactElement {
  const theme = useThemeStore((state) => state.theme);

  if (theme === "animal-crossing") {
    const { checked, defaultChecked, onCheckedChange, disabled, label, description, size, className, ...rest } = props;
    const [internalChecked, setInternalChecked] = React.useState(Boolean(defaultChecked));
    const isControlled = checked !== undefined;
    const resolvedChecked = isControlled ? Boolean(checked) : internalChecked;
    const resolvedSize = size ?? "default";

    return (
      <div className={cn("inline-flex items-center gap-3", className)}>
        <AnimalSwitch
          checked={resolvedChecked}
          defaultChecked={defaultChecked}
          onChange={(next) => {
            if (!isControlled) {
              setInternalChecked(next);
            }
            onCheckedChange?.(next);
          }}
          disabled={disabled}
          size={resolvedSize === "sm" ? "small" : "default"}
          aria-label={label}
          {...(rest as any)}
        />
        {(label || description) && (
          <span className="flex min-w-0 flex-col">
            {label && <span className="text-sm font-semibold leading-5 text-foreground">{label}</span>}
            {description && (
              <span className="text-sm leading-6 text-muted-foreground">{description}</span>
            )}
          </span>
        )}
      </div>
    );
  }

  return defaultRender();
}
