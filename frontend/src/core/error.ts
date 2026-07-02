import { eventBus } from "./eventBus";

export function handleActionError(error: unknown, defaultTitle: string) {
  console.error(defaultTitle, error);
  const description = error instanceof Error ? error.message : String(error);
  eventBus.emit("ui:toast", {
    title: defaultTitle,
    description: description,
    variant: "warning",
  });
}
