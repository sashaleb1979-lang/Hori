import type { AnalyticsOverview } from "@hori/shared";

export function formatAnalyticsOverview(overview: AnalyticsOverview): string {
  const users = overview.topUsers.length
    ? overview.topUsers.map((item, index) => `${index + 1}. ${item.label} — ${item.value}`).join("\n")
    : "пока пусто";
  const channels = overview.topChannels.length
    ? overview.topChannels.map((item, index) => `${index + 1}. ${item.label} — ${item.value}`).join("\n")
    : "пока пусто";
  const peaks = overview.peakHours.length
    ? overview.peakHours.map((item) => `${item.label} (${item.value})`).join(", ")
    : "нет данных";

  return [
    `Ок. Окно: ${overview.window}.`,
    `Сообщений: ${overview.totals.messages}, ответов: ${overview.totals.replies}, упоминаний: ${overview.totals.mentions}.`,
    `Топ юзеров:\n${users}`,
    `Топ каналов:\n${channels}`,
    `Пики активности: ${peaks}.`
  ].join("\n\n");
}

