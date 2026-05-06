import { useMemo, useState } from "react";

import type { UsageStatsDocumentEntry } from "@blog-system/content-core";

import type { UsageStatsWorkbenchDocument, WorkbenchEditorComponentProps } from "../types";
import {
  buildUsageStatsRangeSummary,
  type AggregatedUsagePoint,
  type UsageStatsRange
} from "../usage-stats-view-model";

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

function formatDelta(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function formatRangeLabel(range: UsageStatsRange) {
  switch (range) {
    case "day":
      return "Day";
    case "month":
      return "Month";
    case "year":
      return "Year";
  }
}

function renderBarChart(points: AggregatedUsagePoint[]) {
  if (points.length === 0) {
    return <div className="empty-state">No historical data yet.</div>;
  }

  const maxMagnitude = Math.max(...points.map((point) => Math.abs(point.totalNetCharacterDelta)), 1);

  return (
    <div className="usage-stats-chart">
      {points.map((point) => (
        <div className="usage-stats-chart-bar" key={point.key}>
          <span>{formatDelta(point.totalNetCharacterDelta)}</span>
          <div className="usage-stats-chart-track">
            <div
              className={`usage-stats-chart-fill ${point.totalNetCharacterDelta >= 0 ? "is-positive" : "is-negative"}`}
              style={{
                width: `${(Math.abs(point.totalNetCharacterDelta) / maxMagnitude) * 100}%`
              }}
            />
          </div>
          <strong>{point.label}</strong>
        </div>
      ))}
    </div>
  );
}

function renderTopDocumentRow(entry: UsageStatsDocumentEntry) {
  return (
    <div className="usage-stats-document-row" key={entry.documentId}>
      <div>
        <strong>{entry.title}</strong>
        <span>{entry.documentKind}</span>
      </div>
      <div>
        <strong className={entry.netCharacterDelta >= 0 ? "usage-stats-positive" : "usage-stats-negative"}>
          {formatDelta(entry.netCharacterDelta)}
        </strong>
        <span>{new Date(entry.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

export function UsageStatsEditor({ document }: WorkbenchEditorComponentProps) {
  const usageDocument = document as UsageStatsWorkbenchDocument;
  const [range, setRange] = useState<UsageStatsRange>("month");
  const stats = usageDocument.stats;

  const initialSummary = useMemo(() => buildUsageStatsRangeSummary(stats, range), [range, stats]);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(initialSummary.selectedPeriodKey);

  const summary = useMemo(
    () => buildUsageStatsRangeSummary(stats, range, selectedPeriodKey),
    [range, selectedPeriodKey, stats]
  );
  const topDocuments = summary.documents.slice(0, 12);

  return (
    <div className="usage-stats-editor">
      <div className="usage-stats-toolbar">
        {(["day", "month", "year"] as UsageStatsRange[]).map((entry) => (
          <button
            className={`usage-stats-range-button ${range === entry ? "is-active" : ""}`}
            key={entry}
            onClick={() => {
              setRange(entry);
              const nextSummary = buildUsageStatsRangeSummary(stats, entry);
              setSelectedPeriodKey(nextSummary.selectedPeriodKey);
            }}
            type="button"
          >
            {formatRangeLabel(entry)}
          </button>
        ))}
        <select
          className="usage-stats-period-select"
          value={summary.selectedPeriodKey}
          onChange={(event) => setSelectedPeriodKey(event.target.value)}
        >
          {summary.availablePeriods.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div className="usage-stats-hero">
        <div className="usage-stats-hero-card">
          <span>{summary.summaryLabel} Net Character Delta</span>
          <strong className={summary.totalNetCharacterDelta >= 0 ? "usage-stats-positive" : "usage-stats-negative"}>
            {formatDelta(summary.totalNetCharacterDelta)}
          </strong>
        </div>
        <div className="usage-stats-hero-card">
          <span>{summary.summaryLabel} Active Usage Time</span>
          <strong>{formatDuration(summary.totalActiveMilliseconds)}</strong>
        </div>
        <div className="usage-stats-hero-card">
          <span>Tracked Documents in {summary.summaryLabel}</span>
          <strong>{summary.documents.length}</strong>
        </div>
      </div>

      <div className="usage-stats-panel">
        <div className="usage-stats-panel-header">
          <strong>{summary.chartLabel}</strong>
          <span>Updated {new Date(stats.updatedAt).toLocaleString()}</span>
        </div>
        {renderBarChart(summary.chartPoints)}
      </div>

      <div className="usage-stats-panel">
        <div className="usage-stats-panel-header">
          <strong>Top Changed Documents</strong>
          <span>{summary.summaryLabel}</span>
        </div>
        {topDocuments.length === 0 ? (
          <div className="empty-state">No usage has been recorded in this range yet.</div>
        ) : (
          <div className="usage-stats-document-list">{topDocuments.map(renderTopDocumentRow)}</div>
        )}
      </div>
    </div>
  );
}
