import assert from "node:assert/strict";
import test from "node:test";

import type { UsageStats } from "@blog-system/content-core";

import { buildUsageStatsRangeSummary } from "./usage-stats-view-model";

const sampleStats: UsageStats = {
  daily: [
    {
      activeMilliseconds: 1000,
      documents: [
        {
          documentId: "a",
          documentKind: "article",
          title: "A",
          netCharacterDelta: 3,
          updatedAt: "2026-05-01T08:00:00.000Z"
        }
      ],
      periodKey: "2026-05-01",
      totalNetCharacterDelta: 3,
      updatedAt: "2026-05-01T08:00:00.000Z"
    },
    {
      activeMilliseconds: 2000,
      documents: [
        {
          documentId: "a",
          documentKind: "article",
          title: "A",
          netCharacterDelta: 2,
          updatedAt: "2026-05-02T08:00:00.000Z"
        }
      ],
      periodKey: "2026-05-02",
      totalNetCharacterDelta: 2,
      updatedAt: "2026-05-02T08:00:00.000Z"
    },
    {
      activeMilliseconds: 3000,
      documents: [
        {
          documentId: "b",
          documentKind: "project",
          title: "B",
          netCharacterDelta: 4,
          updatedAt: "2026-06-03T08:00:00.000Z"
        }
      ],
      periodKey: "2026-06-03",
      totalNetCharacterDelta: 4,
      updatedAt: "2026-06-03T08:00:00.000Z"
    }
  ],
  documents: [],
  totalActiveMilliseconds: 6000,
  totalNetCharacterDelta: 9,
  updatedAt: "2026-06-03T08:00:00.000Z"
};

test("month summary exposes daily curve for selected month", () => {
  const summary = buildUsageStatsRangeSummary(sampleStats, "month", "2026-05");

  assert.equal(summary.selectedPeriodKey, "2026-05");
  assert.equal(summary.chartLabel, "Daily curve");
  assert.deepEqual(
    summary.chartPoints.map((point) => point.key),
    ["2026-05-01", "2026-05-02"]
  );
  assert.equal(summary.totalNetCharacterDelta, 5);
});

test("year summary exposes monthly curve for selected year", () => {
  const summary = buildUsageStatsRangeSummary(sampleStats, "year", "2026");

  assert.equal(summary.selectedPeriodKey, "2026");
  assert.equal(summary.chartLabel, "Monthly curve");
  assert.deepEqual(
    summary.chartPoints.map((point) => point.key),
    ["2026-05", "2026-06"]
  );
  assert.equal(summary.chartPoints[0]?.totalNetCharacterDelta, 5);
  assert.equal(summary.chartPoints[1]?.totalNetCharacterDelta, 4);
});
