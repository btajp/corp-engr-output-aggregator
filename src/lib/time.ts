const JST_TIME_ZONE = "Asia/Tokyo";

export function toJstIsoString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${
    getPart("hour")
  }:${getPart("minute")}:${getPart("second")}.000`;
}
