import { describe, it, expect } from 'vitest';
import { modelTimeWindow, timeSeriesRange } from '../modelTimeWindow.js';

const ts = (csvContent, extra = {}) => ({ fileName: 'x.csv', columns: ['time', 'A'], dateColumn: 'time', csvContent, ...extra });

describe('modelTimeWindow', () => {
  it('prefers the saved window', () => {
    const model = {
      metadata: { modelConfig: { startDate: '2015-01-01', endDate: '2015-01-07' }, subsetTime: ['2015-01-01', '2015-12-31'] },
      parameters: [{ key: 'subset_time_start', value: '2016-01-01' }, { key: 'subset_time_end', value: '2016-12-31' }],
    };
    expect(modelTimeWindow(model)).toEqual({ startDate: '2015-01-01', endDate: '2015-01-07', source: 'saved' });
  });

  it('falls back to subset_time parameters, then the import window', () => {
    expect(modelTimeWindow({ parameters: [{ key: 'subset_time_start', value: '2016-02-01 00:00' }, { key: 'subset_time_end', value: '2016-02-07' }] }))
      .toEqual({ startDate: '2016-02-01', endDate: '2016-02-07', source: 'parameters' });
    expect(modelTimeWindow({ metadata: { subsetTime: ['2021-01-01', '2021-12-31'] } }))
      .toEqual({ startDate: '2021-01-01', endDate: '2021-12-31', source: 'import' });
    expect(modelTimeWindow({ metadata: { subsetTime: '2005' } }))
      .toEqual({ startDate: '2005-01-01', endDate: '2005-12-31', source: 'import' });
  });

  it('then the span of the time series (csvContent with a blank index header)', () => {
    const model = { timeSeries: [ts(',A\n2015-01-01 00:00:00,1\n2015-01-01 01:00:00,2\n2015-03-31 23:00:00,3\n')] };
    expect(modelTimeWindow(model)).toEqual({ startDate: '2015-01-01', endDate: '2015-03-31', source: 'data' });
  });

  it('uses an explicit time-series list (the loaded model keeps them in context)', () => {
    const list = [ts('time,A\n2020-06-01 00:00,1\n2020-06-30 23:00,1\n'), { data: [{ t: '2019-01-01' }, { t: '2019-02-01' }], dateColumn: 't' }];
    expect(modelTimeWindow({}, list)).toEqual({ startDate: '2019-01-01', endDate: '2020-06-30', source: 'data' });
  });

  it('else the current year', () => {
    const y = new Date().getFullYear();
    expect(modelTimeWindow({})).toEqual({ startDate: `${y}-01-01`, endDate: `${y}-12-31`, source: 'default' });
  });

  it('ignores an incomplete or invalid saved window', () => {
    const model = { metadata: { modelConfig: { startDate: '2015-01-01' }, subsetTime: ['2021-01-01', '2021-12-31'] } };
    expect(modelTimeWindow(model).source).toBe('import');
  });
});

describe('timeSeriesRange', () => {
  it('returns null without dated rows', () => {
    expect(timeSeriesRange([])).toBeNull();
    expect(timeSeriesRange([ts('time,A\nfoo,1\n')])).toBeNull();
  });
});
