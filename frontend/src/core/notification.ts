export async function sendNativeNotification(title: string, body: string) {
  try {
    if (!("Notification" in window)) {
      console.warn("This browser/environment does not support desktop notifications");
      return;
    }

    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        new Notification(title, { body });
      }
    }
  } catch (err) {
    console.error("Failed to send native notification:", err);
  }
}
