import type React from "react";
import "./animal-cursor.css";

interface AnimalCursorProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  forceAll?: boolean;
}

export default function AnimalCursor({
  children,
  className,
  style,
  forceAll = true,
}: AnimalCursorProps) {
  const cls = [
    "animal-cursor",
    forceAll ? "animal-cursor--force" : "animal-cursor--scoped",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}
