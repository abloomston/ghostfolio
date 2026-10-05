import { UserService } from '@ghostfolio/client/services/user/user.service';
import { parseDate } from '@ghostfolio/common/helper';
import { DataService } from '@ghostfolio/ui/services';

import { Clipboard } from '@angular/cdk/clipboard';
import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DeviceDetectorService } from 'ngx-device-detector';

import { GfAnalysisPageComponent } from './analysis-page.component';

jest.mock('@ghostfolio/ui/services', () => ({
  // eslint-disable-next-line @typescript-eslint/no-shadow
  DataService: class DataService {}
}));
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  // eslint-disable-next-line @typescript-eslint/no-shadow
  UserService: class UserService {}
}));
jest.mock('@ionic/angular/standalone', () => ({
  IonIcon: class IonIcon {}
}));
jest.mock('ionicons', () => ({
  addIcons: jest.fn()
}));
jest.mock('ionicons/icons', () => ({
  copyOutline: {},
  ellipsisVertical: {}
}));

describe('GfAnalysisPageComponent', () => {
  let dataService: jest.Mocked<
    Pick<
      DataService,
      | 'fetchDividends'
      | 'fetchInfo'
      | 'fetchInvestments'
      | 'fetchPortfolioHoldings'
      | 'fetchPortfolioPerformance'
    >
  >;

  beforeEach(async () => {
    dataService = {
      fetchDividends: jest.fn(),
      fetchInfo: jest.fn().mockReturnValue({ benchmarks: [] }),
      fetchInvestments: jest.fn(),
      fetchPortfolioHoldings: jest.fn(),
      fetchPortfolioPerformance: jest.fn()
    };

    await TestBed.configureTestingModule({
      imports: [GfAnalysisPageComponent],
      providers: [
        {
          provide: DeviceDetectorService,
          useValue: { deviceInfo: () => ({ deviceType: 'desktop' }) }
        },
        { provide: Clipboard, useValue: { copy: jest.fn() } },
        {
          provide: MatSnackBar,
          useValue: { open: jest.fn().mockReturnValue({ onAction: jest.fn() }) }
        },
        {
          provide: DataService,
          useValue: dataService
        },
        { provide: UserService, useValue: { getFilters: jest.fn() } }
      ]
    })
      .overrideComponent(GfAnalysisPageComponent, {
        set: { imports: [], template: '' }
      })
      .compileComponents();
  });

  it('shares a single time axis domain across all stacked time series charts', () => {
    const fixture = TestBed.createComponent(GfAnalysisPageComponent);
    const component = fixture.componentInstance;

    // The portfolio evolution (daily) series spans January to May
    component['investments'] = [
      { date: '2024-01-05', investment: 100 },
      { date: '2024-05-10', investment: 500 }
    ];
    component['performanceDataItems'] = [
      { date: '2024-01-05', value: 100 },
      { date: '2024-05-10', value: 500 }
    ];

    // The (monthly) investment and dividend timelines only contain the months
    // where activity was tracked. Without a shared domain, each of the three
    // charts would auto-fit its time axis to its own data and the same date
    // would no longer be rendered at the same horizontal position.
    component['investmentsByGroup'] = [
      { date: '2024-02-01', investment: 0 },
      { date: '2024-04-01', investment: 100 }
    ];
    component['dividendsByGroup'] = [
      { date: '2024-02-01', investment: 0 },
      { date: '2024-03-01', investment: 20 }
    ];

    expect(component.getTimeAxisDomain()).toEqual({
      max: parseDate('2024-05-10').getTime(),
      min: parseDate('2024-01-05').getTime()
    });
  });

  it('returns no time axis domain while no chart data has been loaded', () => {
    const fixture = TestBed.createComponent(GfAnalysisPageComponent);
    const component = fixture.componentInstance;

    component['investments'] = [];
    component['performanceDataItems'] = [];
    component['investmentsByGroup'] = [];
    component['dividendsByGroup'] = [];

    expect(component.getTimeAxisDomain()).toBeUndefined();
  });
});
