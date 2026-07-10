const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return dateFormatter.format(date);
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return dateTimeFormatter.format(date);
}
