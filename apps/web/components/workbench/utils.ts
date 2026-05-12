export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en-US" : "zh-CN";
  return date.toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function compactTitle(value: string, fallback = "New conversation") {
  const text = value.replace(/\s+/g, " ").trim();
  return text ? (text.length > 42 ? `${text.slice(0, 42)}...` : text) : fallback;
}

export function taskTone(status: string) {
  if (status === "succeeded") return "text-emerald-700 bg-emerald-500/10 border-emerald-500/25";
  if (status === "failed" || status === "cancelled") return "text-red-700 bg-red-500/10 border-red-500/25";
  if (status === "running") return "text-blue-700 bg-blue-500/10 border-blue-500/25";
  return "text-amber-700 bg-amber-500/10 border-amber-500/25";
}
