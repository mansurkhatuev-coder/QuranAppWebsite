(() => {
  "use strict";

  const STORES = Object.freeze([
    { key: "apple", mode: "automatic" },
    { key: "googleplay", mode: "automatic" },
    { key: "rustore", mode: "manual" },
  ]);

  function dayKey(value, timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = Object.fromEntries(parts.map((item) => [item.type, item.value]));
    return `${part.year}-${part.month}-${part.day}`;
  }

  function resolvePlan(snapshot, now = new Date(), timeZone = "Europe/Moscow") {
    const today = dayKey(now instanceof Date ? now : new Date(now), timeZone);
    const automatic = [];
    const manual = [];
    for (const store of STORES) {
      const timestamp = snapshot?.[store.key]?.fetchedAt;
      const freshToday = timestamp && dayKey(new Date(timestamp), timeZone) === today;
      if (freshToday) continue;
      (store.mode === "automatic" ? automatic : manual).push(store.key);
    }
    return { dayKey: today, automatic, manual, hasStale: automatic.length + manual.length > 0 };
  }

  function shouldPrompt(plan, dismissedDay) {
    return Boolean(plan?.hasStale && plan.dayKey && dismissedDay !== plan.dayKey);
  }

  window.AdminV2StoreRefreshPolicy = Object.freeze({ resolvePlan, shouldPrompt });
})();
