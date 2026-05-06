import type {
  UsageStats,
  UsageStatsDocumentEntry,
  UsageStatsPeriodEntry
} from "@blog-system/content-core";

export type UsageStatsRange = "day" | "month" | "year";

export interface AggregatedUsagePoint {
  activeMilliseconds: number;
  documents: UsageStatsDocumentEntry[];
  key: string;
  label: string;
  totalNetCharacterDelta: number;
  updatedAt: string;
}

export interface UsageStatsRangeSummary {
  availablePeriods: Array<{ key: string; label: string }>;
  chartLabel: string;
  chartPoints: AggregatedUsagePoint[];
  documents: UsageStatsDocumentEntry[];
  selectedPeriodKey: string;
  summaryLabel: string;
  totalActiveMilliseconds: number;
  totalNetCharacterDelta: number;
}

function formatMonthLabel(value: string) {
  return value;
}

function sortByUpdatedAt(entries: UsageStatsDocumentEntry[]) {
  return [...entries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function mergeDocuments(entries: UsageStatsDocumentEntry[]) {
  const documentMap = new Map<string, UsageStatsDocumentEntry>();

  for (const entry of entries) {
    const current = documentMap.get(entry.documentId);
    if (!current) {
      documentMap.set(entry.documentId, { ...entry });
      continue;
    }

    documentMap.set(entry.documentId, {
      ...current,
      documentKind: entry.documentKind,
      title: entry.title,
      netCharacterDelta: current.netCharacterDelta + entry.netCharacterDelta,
      updatedAt: entry.updatedAt > current.updatedAt ? entry.updatedAt : current.updatedAt
    });
  }

  return sortByUpdatedAt([...documentMap.values()]).sort(
    (left, right) => Math.abs(right.netCharacterDelta) - Math.abs(left.netCharacterDelta)
  );
}

function buildDailyPoints(entries: UsageStatsPeriodEntry[]): AggregatedUsagePoint[] {
  return [...entries]
    .sort((left, right) => left.periodKey.localeCompare(right.periodKey))
    .map((entry) => ({
      activeMilliseconds: entry.activeMilliseconds,
      documents: entry.documents,
      key: entry.periodKey,
      label: entry.periodKey.slice(5),
      totalNetCharacterDelta: entry.totalNetCharacterDelta,
      updatedAt: entry.updatedAt
    }));
}

function aggregatePoints(
  entries: UsageStatsPeriodEntry[],
  keySelector: (entry: UsageStatsPeriodEntry) => string,
  labelSelector: (key: string) => string
) {
  const pointMap = new Map<string, AggregatedUsagePoint>();

  for (const entry of entries) {
    const key = keySelector(entry);
    const current =
      pointMap.get(key) ??
      ({
        activeMilliseconds: 0,
        documents: [],
        key,
        label: labelSelector(key),
        totalNetCharacterDelta: 0,
        updatedAt: entry.updatedAt
      } satisfies AggregatedUsagePoint);

    current.activeMilliseconds += entry.activeMilliseconds;
    current.documents.push(...entry.documents);
    current.totalNetCharacterDelta += entry.totalNetCharacterDelta;
    current.updatedAt = current.updatedAt > entry.updatedAt ? current.updatedAt : entry.updatedAt;
    pointMap.set(key, current);
  }

  return [...pointMap.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((point) => ({
      ...point,
      documents: mergeDocuments(point.documents)
    }));
}

function getLatestKey(keys: string[]) {
  return [...keys].sort((left, right) => left.localeCompare(right)).at(-1) ?? "";
}

export function buildUsageStatsRangeSummary(
  stats: UsageStats,
  range: UsageStatsRange,
  requestedPeriodKey?: string
): UsageStatsRangeSummary {
  const daily = stats.daily ?? [];

  if (range === "day") {
    const dailyPoints = buildDailyPoints(daily);
    const availablePeriods = dailyPoints.map((point) => ({
      key: point.key,
      label: point.key
    }));
    const selectedPeriodKey = requestedPeriodKey && availablePeriods.some((entry) => entry.key === requestedPeriodKey)
      ? requestedPeriodKey
      : getLatestKey(availablePeriods.map((entry) => entry.key));
    const selectedPoint = dailyPoints.find((point) => point.key === selectedPeriodKey) ?? null;

    return {
      availablePeriods,
      chartLabel: "Day summary",
      chartPoints: selectedPoint ? [selectedPoint] : [],
      documents: selectedPoint ? mergeDocuments(selectedPoint.documents) : [],
      selectedPeriodKey,
      summaryLabel: selectedPeriodKey || "Day",
      totalActiveMilliseconds: selectedPoint?.activeMilliseconds ?? 0,
      totalNetCharacterDelta: selectedPoint?.totalNetCharacterDelta ?? 0
    };
  }

  if (range === "month") {
    const monthKeys = Array.from(new Set(daily.map((entry) => entry.periodKey.slice(0, 7)))).sort((left, right) =>
      left.localeCompare(right)
    );
    const availablePeriods = monthKeys.map((key) => ({
      key,
      label: formatMonthLabel(key)
    }));
    const selectedPeriodKey = requestedPeriodKey && monthKeys.includes(requestedPeriodKey)
      ? requestedPeriodKey
      : getLatestKey(monthKeys);
    const monthEntries = daily.filter((entry) => entry.periodKey.startsWith(selectedPeriodKey));
    const chartPoints = buildDailyPoints(monthEntries);

    return {
      availablePeriods,
      chartLabel: "Daily curve",
      chartPoints,
      documents: mergeDocuments(chartPoints.flatMap((point) => point.documents)),
      selectedPeriodKey,
      summaryLabel: selectedPeriodKey || "Month",
      totalActiveMilliseconds: chartPoints.reduce((sum, point) => sum + point.activeMilliseconds, 0),
      totalNetCharacterDelta: chartPoints.reduce((sum, point) => sum + point.totalNetCharacterDelta, 0)
    };
  }

  const yearKeys = Array.from(new Set(daily.map((entry) => entry.periodKey.slice(0, 4)))).sort((left, right) =>
    left.localeCompare(right)
  );
  const availablePeriods = yearKeys.map((key) => ({
    key,
    label: key
  }));
  const selectedPeriodKey = requestedPeriodKey && yearKeys.includes(requestedPeriodKey)
    ? requestedPeriodKey
    : getLatestKey(yearKeys);
  const yearEntries = daily.filter((entry) => entry.periodKey.startsWith(selectedPeriodKey));
  const chartPoints = aggregatePoints(
    yearEntries,
    (entry) => entry.periodKey.slice(0, 7),
    (key) => key.slice(5)
  );

  return {
    availablePeriods,
    chartLabel: "Monthly curve",
    chartPoints,
    documents: mergeDocuments(chartPoints.flatMap((point) => point.documents)),
    selectedPeriodKey,
    summaryLabel: selectedPeriodKey || "Year",
    totalActiveMilliseconds: chartPoints.reduce((sum, point) => sum + point.activeMilliseconds, 0),
    totalNetCharacterDelta: chartPoints.reduce((sum, point) => sum + point.totalNetCharacterDelta, 0)
  };
}
