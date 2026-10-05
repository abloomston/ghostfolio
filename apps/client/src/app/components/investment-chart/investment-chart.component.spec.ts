import { parseDate } from '@ghostfolio/common/helper';

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { By } from '@angular/platform-browser';

import { GfInvestmentChartComponent } from './investment-chart.component';

// The tests run in jsdom, which does not provide a usable 2D canvas context.
// Capture the chart configuration instead of rendering a real chart.
let mockChartInstances: { args: [unknown, Record<string, unknown>] }[] = [];

jest.mock('chart.js', () => {
  class Chart {
    public data: Record<string, unknown>;
    public options: Record<string, unknown>;

    public constructor(...args: [unknown, Record<string, unknown>]) {
      this.data = args[1].data;
      this.options = args[1].options;

      mockChartInstances.push({ args });
    }

    public destroy() {
      // no-op
    }

    public update() {
      // no-op
    }

    public static register() {
      // no-op
    }
  }

  return {
    BarController: { id: 'barController' },
    BarElement: { id: 'barElement' },
    Chart,
    LinearScale: { id: 'linearScale' },
    LineController: { id: 'lineController' },
    LineElement: { id: 'lineElement' },
    PointElement: { id: 'pointElement' },
    TimeScale: { id: 'timeScale' },
    Tooltip: { id: 'tooltip' },
    register: jest.fn()
  };
});
jest.mock('chartjs-adapter-date-fns', () => ({}));
jest.mock('@ghostfolio/ui/chart', () => ({
  getTimeSeriesTooltipOptions: jest.fn(),
  registerChartConfiguration: jest.fn()
}));
jest.mock('ngx-skeleton-loader', () => {
  const { Directive } = jest.requireActual('@angular/core');

  class NgxSkeletonLoaderComponent {}

  return {
    NgxSkeletonLoaderModule: Directive({
      selector: 'ngx-skeleton-loader',
      standalone: true,
      template: ''
    })(NgxSkeletonLoaderComponent)
  };
});

@Component({
  standalone: true,
  imports: [GfInvestmentChartComponent],
  template: `
    <gf-investment-chart
      [benchmarkDataItems]="benchmarkDataItems"
      [historicalDataItems]="historicalDataItems"
      [timeAxisDomain]="timeAxisDomain"
    />
  `
})
class TestHostComponent {
  public benchmarkDataItems = [
    { date: '2024-01-05', investment: 100 },
    { date: '2024-05-10', investment: 500 }
  ];
  public historicalDataItems = [
    { date: '2024-01-05', value: 100 },
    { date: '2024-05-10', value: 500 }
  ];
  public timeAxisDomain: { max: number; min: number } | undefined;
}

// jsdom does not implement `window.matchMedia`; the chart helpers read the
// user's preferred color scheme through it
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }))
  });
}

beforeEach(() => {
  // The chart helpers resolve their colors from CSS custom properties, which
  // are not defined in jsdom; provide the light theme values
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--light-primary-text', '20, 26, 27');
  rootStyle.setProperty('--dark-primary-text', '224, 226, 226');
  rootStyle.setProperty('--light-background', '255, 255, 255');
  rootStyle.setProperty('--dark-background', '20, 26, 27');
});

describe('GfInvestmentChartComponent', () => {
  // The chart is created from the template canvas, which only exists after the
  // view has rendered. Render the host view first, then drive the child's
  // `ngOnChanges` to mirror the runtime sequence where inputs arrive after the
  // canvas is available.
  function setupChartFixture() {
    const fixture = TestBed.createComponent(TestHostComponent);
    const host = fixture.componentInstance;

    fixture.detectChanges();

    const chart = fixture.debugElement.query(
      By.directive(GfInvestmentChartComponent)
    ).componentInstance as GfInvestmentChartComponent;

    return { chart, fixture, host };
  }

  function applyDomain(
    chart: GfInvestmentChartComponent,
    fixture: import('@angular/core/testing').ComponentFixture<TestHostComponent>,
    domain: { max: number; min: number }
  ) {
    chart.timeAxisDomain = domain;
    // The canvas is only available after the view has rendered; trigger the
    // change hook once it is, mirroring the runtime sequence where inputs
    // arrive after the canvas exists
    chart.ngOnChanges();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    mockChartInstances = [];

    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();
  });

  it('applies the shared time axis domain to the x scale', () => {
    const { chart, fixture } = setupChartFixture();

    applyDomain(chart, fixture, {
      max: parseDate('2024-05-10').getTime(),
      min: parseDate('2024-01-05').getTime()
    });

    expect(mockChartInstances).toHaveLength(1);
    const [, config] = mockChartInstances[0].args;

    expect(config.options.scales.x.min).toEqual(
      parseDate('2024-01-05').getTime()
    );
    expect(config.options.scales.x.max).toEqual(
      parseDate('2024-05-10').getTime()
    );
  });

  it('keeps the x scale aligned when the shared time axis domain changes', () => {
    const { chart, fixture } = setupChartFixture();

    applyDomain(chart, fixture, {
      max: parseDate('2024-05-10').getTime(),
      min: parseDate('2024-01-05').getTime()
    });

    // The analysis page recomputes the shared domain once more chart data has
    // been loaded; the existing chart instance must adopt the new domain
    applyDomain(chart, fixture, {
      max: parseDate('2024-06-01').getTime(),
      min: parseDate('2023-12-31').getTime()
    });

    const chartConfig = mockChartInstances[0].args[1];

    expect(chartConfig.options.scales.x.min).toEqual(
      parseDate('2023-12-31').getTime()
    );
    expect(chartConfig.options.scales.x.max).toEqual(
      parseDate('2024-06-01').getTime()
    );
  });
});
