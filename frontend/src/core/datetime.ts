/**
 * Formats a Unix timestamp (in seconds) according to the specified format pattern.
 * If the task year matches the current year, the year component is omitted.
 */
export function formatDateTime(timestamp: number | undefined | null, formatPattern: string): string {
  if (!timestamp) return "--";
  
  const date = new Date(timestamp * 1000);
  const currentYear = new Date().getFullYear();
  const taskYear = date.getFullYear();
  const showYear = taskYear !== currentYear;

  const YYYY = String(taskYear);
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  const pattern = formatPattern || "YYYY-MM-DD HH:mm:ss";

  if (pattern === "YYYY/MM/DD HH:mm:ss") {
    return showYear
      ? `${YYYY}/${MM}/${DD} ${HH}:${mm}:${ss}`
      : `${MM}/${DD} ${HH}:${mm}:${ss}`;
  } else if (pattern === "YYYY年MM月DD日 HH:mm:ss") {
    return showYear
      ? `${YYYY}年${MM}月${DD}日 ${HH}时${mm}分${ss}秒`
      : `${MM}月${DD}日 ${HH}时${mm}分${ss}秒`;
  } else {
    // Default YYYY-MM-DD HH:mm:ss
    return showYear
      ? `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`
      : `${MM}-${DD} ${HH}:${mm}:${ss}`;
  }
}
