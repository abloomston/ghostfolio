import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick
} from '@angular/core/testing';
import '@angular/localize/init';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  MatDatepicker,
  MatDatepickerModule
} from '@angular/material/datepicker';
import { By } from '@angular/platform-browser';
import { addMonths, isSameMonth, startOfMonth } from 'date-fns';
import { DeviceDetectorService } from 'ngx-device-detector';

import { GfFireCalculatorComponent } from './fire-calculator.component';
import { FireCalculatorService } from './fire-calculator.service';

jest.mock('@ionic/angular/standalone', () => {
  const { Directive } = jest.requireActual('@angular/core');

  class IonIcon {}

  return {
    IonIcon: Directive({
      inputs: ['name'],
      selector: 'ion-icon',
      standalone: true
    })(IonIcon)
  };
});

jest.mock('color', () => {
  const createColor = (value: string) => ({
    hex: () => value,
    lighten: () => createColor(value)
  });

  return { __esModule: true, default: createColor };
});

jest.mock('chartjs-adapter-date-fns', () => ({}));

jest.mock('chart.js', () => {
  class ChartMock {
    public static defaults = { get: jest.fn(), set: jest.fn() };
    public static register = jest.fn();

    public data: unknown;
    public options: unknown;

    public destroy = jest.fn();
    public update = jest.fn();

    public constructor(
      _element: unknown,
      configuration: { data?: unknown; options?: unknown }
    ) {
      this.data = configuration?.data;
      this.options = configuration?.options;
    }
  }

  return {
    BarController: class {},
    BarElement: class {},
    CategoryScale: class {},
    Chart: ChartMock,
    LinearScale: class {},
    Tooltip: class {}
  };
});

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [GfFireCalculatorComponent],
  selector: 'gf-test-host',
  template: `
    <gf-fire-calculator
      [currency]="currency"
      [deviceType]="deviceType"
      [expectedInflationRate]="expectedInflationRate"
      [expectedReturn]="expectedReturn"
      [fireWealth]="fireWealth"
      [hasPermissionToUpdateUserSettings]="hasPermissionToUpdateUserSettings"
      [projectedTotalAmount]="projectedTotalAmount"
      [savingsRate]="savingsRate"
    />
  `
})
class TestHostComponent {
  public currency = 'USD';
  public deviceType = 'desktop';
  public expectedInflationRate = 0;
  public expectedReturn = 0;
  public fireWealth = 10000;
  public hasPermissionToUpdateUserSettings = true;
  public projectedTotalAmount = 50000;
  public savingsRate = 1000;
}

describe('GfFireCalculatorComponent One-Time Savings', () => {
  let component: GfFireCalculatorComponent;
  let fixture: ComponentFixture<TestHostComponent>;

  beforeAll(() => {
    // jsdom does not implement matchMedia, which the chart tooltips use
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        addEventListener: jest.fn(),
        addListener: jest.fn(),
        dispatchEvent: jest.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: jest.fn(),
        removeListener: jest.fn()
      }),
      writable: true
    });
  });

  beforeEach(fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent, MatDatepickerModule],
      providers: [
        FireCalculatorService,
        provideNativeDateAdapter(),
        {
          provide: DeviceDetectorService,
          useValue: {
            deviceInfo: () => ({ deviceType: 'desktop' })
          }
        }
      ]
    });

    fixture = TestBed.createComponent(TestHostComponent);

    // Wait for the chart canvas and flush the debounced outputs
    fixture.detectChanges();
    tick(1000);

    component = fixture.debugElement.query(
      By.directive(GfFireCalculatorComponent)
    ).componentInstance as GfFireCalculatorComponent;
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.chart).toBeDefined();
  });

  it('should retire earlier with a lump sum added right now', () => {
    expect(component.periodsToRetire).toBe(40);

    component.onAddOneTimeSaving();
    component.oneTimeSavings.at(0).get('amount').setValue(20000);

    expect(component.periodsToRetire).toBe(20);
  });

  it('should render a row for each one-time saving', () => {
    const getLabels = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('mat-label')
      ).map((element) => element.textContent);

    expect(getLabels()).not.toContain('One-Time Savings');

    component.onAddOneTimeSaving();
    fixture.detectChanges();

    expect(getLabels()).toContain('One-Time Savings');
    expect(getLabels()).toContain('Date');
  });

  it('should not count a lump sum before it is contributed', () => {
    component.onAddOneTimeSaving();
    component.oneTimeSavings
      .at(0)
      .get('date')
      .setValue(addMonths(startOfMonth(new Date()), 30));
    component.oneTimeSavings.at(0).get('amount').setValue(20000);

    expect(component.periodsToRetire).toBe(30);
  });

  it('should show the lump sum in the chart as one-time savings', () => {
    component.onAddOneTimeSaving();
    component.oneTimeSavings.at(0).get('amount').setValue(20000);

    const { datasets } = component.chart.data;

    expect(
      datasets
        .find(({ label }: { label: string }) => label === 'Deposit')
        .data.at(-1)
    ).toBeCloseTo(10000, 6);
    expect(
      datasets
        .find(({ label }: { label: string }) => label === 'One-Time Savings')
        .data.at(-1)
    ).toBeCloseTo(20000, 6);
    expect(
      datasets
        .find(({ label }: { label: string }) => label === 'Savings')
        .data.at(-1)
    ).toBeGreaterThan(0);
  });

  it('should stop counting a removed lump sum', () => {
    component.onAddOneTimeSaving();
    component.oneTimeSavings.at(0).get('amount').setValue(20000);

    expect(component.periodsToRetire).toBe(20);

    component.onRemoveOneTimeSaving(0);

    expect(component.oneTimeSavings.length).toBe(0);
    expect(component.periodsToRetire).toBe(40);
  });

  it('should label the current month as right now', () => {
    component.onAddOneTimeSaving();

    expect(component['getOneTimeSavingLabel'](0)).toBe('Right now');

    component.oneTimeSavings
      .at(0)
      .get('date')
      .setValue(addMonths(startOfMonth(new Date()), 30));

    expect(component['getOneTimeSavingLabel'](0)).not.toBe('Right now');
  });

  it('should not date a lump sum in the past', () => {
    const close = jest.fn();
    const datepicker = { close } as unknown as MatDatepicker<Date>;

    component.onAddOneTimeSaving();
    component.setOneTimeSavingMonthAndYear(new Date(2000, 0, 1), 0, datepicker);

    expect(
      isSameMonth(component.oneTimeSavings.at(0).get('date').value, new Date())
    ).toBe(true);
    expect(close).toHaveBeenCalled();
  });
});
