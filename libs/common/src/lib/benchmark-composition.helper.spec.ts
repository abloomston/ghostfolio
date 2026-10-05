import {
  calculateBlendedBenchmarkData,
  isValidBenchmarkComposition,
  parseBenchmarkSetting,
  serializeBenchmarkSetting
} from './benchmark-composition.helper';

describe('benchmark-composition.helper', () => {
  describe('parseBenchmarkSetting', () => {
    it('keeps legacy single benchmark settings compatible', () => {
      expect(parseBenchmarkSetting('benchmark-id')).toEqual([
        { id: 'benchmark-id', percentage: 100 }
      ]);
    });

    it('parses a saved blended benchmark', () => {
      const allocations = [
        { id: 'bnd-id', percentage: 40 },
        { id: 'vt-id', percentage: 60 }
      ];

      expect(parseBenchmarkSetting(JSON.stringify(allocations))).toEqual(
        allocations
      );
    });
  });

  describe('isValidBenchmarkComposition', () => {
    it('requires distinct instruments whose allocations total 100 percent', () => {
      expect(
        isValidBenchmarkComposition([
          { id: 'bnd-id', percentage: 40 },
          { id: 'vt-id', percentage: 60 }
        ])
      ).toBe(true);
      expect(
        isValidBenchmarkComposition([
          { id: 'bnd-id', percentage: 40 },
          { id: 'vt-id', percentage: 50 }
        ])
      ).toBe(false);
      expect(
        isValidBenchmarkComposition([
          { id: 'bnd-id', percentage: 40 },
          { id: 'bnd-id', percentage: 60 }
        ])
      ).toBe(false);
    });
  });

  describe('serializeBenchmarkSetting', () => {
    it('clears the setting when no benchmarks are selected', () => {
      expect(serializeBenchmarkSetting([])).toBe('');
    });

    it('stores a single 100-percent benchmark in the legacy format', () => {
      expect(
        serializeBenchmarkSetting([{ id: 'benchmark-id', percentage: 100 }])
      ).toBe('benchmark-id');
    });

    it('stores multiple benchmarks with their percentage allocations', () => {
      const allocations = [
        { id: 'bnd-id', percentage: 40 },
        { id: 'vt-id', percentage: 60 }
      ];

      expect(serializeBenchmarkSetting(allocations)).toBe(
        JSON.stringify(allocations)
      );
    });
  });

  describe('calculateBlendedBenchmarkData', () => {
    it('calculates weighted returns using the latest available value per instrument', () => {
      expect(
        calculateBlendedBenchmarkData({
          allocations: [
            { id: 'bnd-id', percentage: 40 },
            { id: 'vt-id', percentage: 60 }
          ],
          dates: ['2024-01-01', '2024-01-02'],
          marketDataByBenchmark: {
            'bnd-id': [
              { date: '2024-01-01', value: 5 },
              { date: '2024-01-02', value: 10 }
            ],
            'vt-id': [{ date: '2024-01-01', value: 10 }]
          }
        })
      ).toEqual([
        { date: '2024-01-01', value: 8 },
        { date: '2024-01-02', value: 10 }
      ]);
    });
  });
});
