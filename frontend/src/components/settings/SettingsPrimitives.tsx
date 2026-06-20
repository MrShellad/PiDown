import * as React from "react";
import { cn } from "@/lib/utils";

type SettingsActionAlign = "title" | "start" | "center";

function SettingsActionSlot({
  action,
  align,
}: {
  action: React.ReactNode;
  align: SettingsActionAlign;
}) {
  return (
    <div
      className={cn(
        "shrink-0",
        align === "title" && "flex h-5 items-center",
        align === "start" && "self-start",
        align === "center" && "self-center"
      )}
    >
      {action}
    </div>
  );
}

export function SettingsSectionCard({
  className,
  children,
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

export function SettingsSectionHeader({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon ? <div className="mt-0.5 text-primary">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold leading-6 text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex h-6 shrink-0 items-center">{action}</div> : null}
    </div>
  );
}

export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </label>
        {hint ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-background/70 px-4 text-sm leading-5 text-foreground outline-none transition",
        "placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className
      )}
    />
  );
}

export function SettingsTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-lg border border-border bg-background/70 px-4 py-3 text-sm leading-5 text-foreground outline-none transition resize-y min-h-[80px]",
        "placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20",
        props.className
      )}
    />
  );
}

export function SettingsList({
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "divide-y divide-border rounded-lg border border-border bg-secondary/20",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SettingsListItem({
  title,
  description,
  action,
  children,
  className,
  actionAlign = "title",
  childrenSpan = "content",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  actionAlign?: SettingsActionAlign;
  childrenSpan?: "content" | "full";
}) {
  if (childrenSpan === "full") {
    return (
      <div className={cn("px-4 py-4", className)}>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-5 text-foreground">{title}</div>
            {description ? (
              <div className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          {action ? <SettingsActionSlot action={action} align={actionAlign} /> : null}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-6 px-4 py-4",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-5 text-foreground">{title}</div>
        {description ? (
          <div className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
      {action ? <SettingsActionSlot action={action} align={actionAlign} /> : null}
    </div>
  );
}
