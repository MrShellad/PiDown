import * as React from "react";
import { cn } from "@/lib/utils";

export function SettingsSectionCard({
  className,
  children,
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-xl)] border border-border bg-card/75 p-6 backdrop-blur-xl",
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
      {action ? <div className="shrink-0">{action}</div> : null}
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
        "h-10 w-full rounded-[var(--radius-lg)] border border-border bg-background/70 px-4 text-sm leading-5 text-foreground outline-none transition",
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
        "divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-secondary/20",
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
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
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
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
