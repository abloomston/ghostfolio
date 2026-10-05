import {
  BenchmarkAllocation,
  LineChartItem
} from '@ghostfolio/common/interfaces';

function isBenchmarkAllocation(value: unknown): value is BenchmarkAllocation {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { id, percentage } = value as Record<string, unknown>;

  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof percentage === 'number' &&
    Number.isFinite(percentage) &&
    percentage > 0 &&
    percentage <= 100
  );
}

export function parseBenchmarkSetting(setting?: string): BenchmarkAllocation[] {
  if (!setting) {
    return [];
  }

  try {
    const parsed = JSON.parse(setting) as unknown;

    if (Array.isArray(parsed) && parsed.every(isBenchmarkAllocation)) {
      return parsed;
    }
  } catch {}

  // Keep settings saved before blended benchmarks were introduced working.
  return [{ id: setting, percentage: 100 }];
}

export function isValidBenchmarkComposition(
  allocations: BenchmarkAllocation[]
): boolean {
  const selectedAllocations = allocations.filter(({ id }) => id);

  return (
    selectedAllocations.length > 0 &&
    selectedAllocations.length === allocations.length &&
    new Set(selectedAllocations.map(({ id }) => id)).size ===
      selectedAllocations.length &&
    selectedAllocations.every(
      ({ percentage }) =>
        Number.isFinite(percentage) && percentage > 0 && percentage <= 100
    ) &&
    Math.abs(
      selectedAllocations.reduce(
        (total, { percentage }) => total + percentage,
        0
      ) - 100
    ) < 0.000001
  );
}

export function serializeBenchmarkSetting(
  allocations: BenchmarkAllocation[]
): string {
  if (allocations.length === 0) {
    return '';
  }

  if (!isValidBenchmarkComposition(allocations)) {
    return '';
  }

  if (allocations.length === 1 && allocations[0].percentage === 100) {
    return allocations[0].id;
  }

  return JSON.stringify(allocations);
}

export function calculateBlendedBenchmarkData({
  allocations,
  dates,
  marketDataByBenchmark
}: {
  allocations: BenchmarkAllocation[];
  dates: string[];
  marketDataByBenchmark: Record<string, LineChartItem[]>;
}): LineChartItem[] {
  const valuesByBenchmark = Object.fromEntries(
    Object.entries(marketDataByBenchmark).map(([id, marketData]) => {
      return [id, new Map(marketData.map(({ date, value }) => [date, value]))];
    })
  );
  const latestValuesByBenchmark: Record<string, number> = {};

  return dates.flatMap((date) => {
    let value = 0;

    for (const { id, percentage } of allocations) {
      const valueForDate = valuesByBenchmark[id]?.get(date);

      if (typeof valueForDate === 'number') {
        latestValuesByBenchmark[id] = valueForDate;
      }

      const benchmarkValue = latestValuesByBenchmark[id];

      if (typeof benchmarkValue !== 'number') {
        return [];
      }

      value += (benchmarkValue * percentage) / 100;
    }

    return [{ date, value }];
  });
}
