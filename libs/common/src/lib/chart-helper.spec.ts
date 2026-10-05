import { getTimeAxisDomain } from './chart-helper';
import { parseDate } from './helper';

describe('ChartHelper', () => {
  describe('getTimeAxisDomain', () => {
    it('returns the smallest domain that contains all of the given dates', () => {
      const domain = getTimeAxisDomain([
        '2024-03-15',
        '2024-01-01',
        '2024-06-30'
      ]);

      expect(domain).toEqual({
        max: parseDate('2024-06-30').getTime(),
        min: parseDate('2024-01-01').getTime()
      });
    });

    it('ignores dates that cannot be parsed', () => {
      const domain = getTimeAxisDomain(['2024-01-01', undefined, 'invalid']);

      expect(domain).toEqual({
        max: parseDate('2024-01-01').getTime(),
        min: parseDate('2024-01-01').getTime()
      });
    });

    it('returns undefined when there is no valid date', () => {
      expect(getTimeAxisDomain([])).toBeUndefined();
      expect(getTimeAxisDomain([undefined, null, ''])).toBeUndefined();
    });

    it('aligns a grouped timeline with a daily series over the same span', () => {
      // A monthly timeline only contains the first day of the months where a
      // dividend or an investment was tracked
      const monthlyDates = ['2024-02-01', '2024-04-01'];
      // The daily portfolio evolution series spans the full selected range
      const dailyDates = ['2024-01-15', '2024-01-16', '2024-05-01'];

      const domain = getTimeAxisDomain([...monthlyDates, ...dailyDates]);

      // The shared domain is anchored by the outermost daily dates, so the
      // monthly timeline and the daily series share the same time axis
      expect(domain).toEqual({
        max: parseDate('2024-05-01').getTime(),
        min: parseDate('2024-01-15').getTime()
      });
    });
  });
});
