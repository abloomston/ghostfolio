import { LayoutService } from '@ghostfolio/client/core/layout.service';
import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { PortfolioPerformance } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { Router } from '@angular/router';
import { DeviceDetectorService } from 'ngx-device-detector';
import { EMPTY, of } from 'rxjs';

import { GfHomeOverviewComponent } from './home-overview.component';

jest.mock('@ghostfolio/client/components/portfolio-performance/portfolio-performance.component', () => ({
  GfPortfolioPerformanceComponent: class GfPortfolioPerformanceComponent {}
}));
jest.mock('@ghostfolio/client/core/layout.service', () => ({
  LayoutService: class LayoutService {}
}));
jest.mock('@ghostfolio/client/services/impersonation-storage.service', () => ({
  ImpersonationStorageService: class ImpersonationStorageService {}
}));
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class UserService {}
}));
jest.mock('@ghostfolio/ui/holdings-table', () => ({
  GfHoldingsTableComponent: class GfHoldingsTableComponent {}
}));
jest.mock('@ghostfolio/ui/line-chart', () => ({
  GfLineChartComponent: class GfLineChartComponent {}
}));
jest.mock('@ghostfolio/ui/services', () => ({
  DataService: class DataService {}
}));

describe('GfHomeOverviewComponent', () => {
  let dataService: jest.Mocked<
    Pick<DataService, 'fetchPortfolioPerformance'>
  >;

  const performance: PortfolioPerformance = {
    currentNetWorth: 0,
    currentValueInBaseCurrency: 100,
    dividendInBaseCurrency: 0,
    dividendPercentageWithCurrencyEffect: 0,
    netPerformance: 0,
    netPerformancePercentage: 0,
    netPerformancePercentageWithCurrencyEffect: 0,
    netPerformanceWithCurrencyEffect: 0,
    totalInvestment: 0,
    totalInvestmentValueWithCurrencyEffect: 0
  };

  beforeEach(async () => {
    dataService = {
      fetchPortfolioPerformance: jest.fn().mockReturnValue(
        of({
          chart: [],
          performance,
          hasErrors: false
        })
      )
    };

    await TestBed.configureTestingModule({
      imports: [GfHomeOverviewComponent],
      providers: [
        {
          provide: UserService,
          useValue: {
            getFilters: jest.fn().mockReturnValue([]),
            stateChanged: of({
              user: { permissions: [], scopes: [], settings: {} }
            })
          }
        },
        {
          provide: ImpersonationStorageService,
          useValue: { onChangeHasImpersonation: () => of(false) }
        },
        {
          provide: LayoutService,
          useValue: { shouldReloadContent$: EMPTY }
        },
        { provide: DataService, useValue: dataService },
        {
          provide: DeviceDetectorService,
          useValue: { deviceInfo: () => ({ deviceType: 'desktop' }) }
        },
        { provide: Router, useValue: { navigate: jest.fn() } }
      ]
    })
      .overrideComponent(GfHomeOverviewComponent, {
        set: { imports: [], template: '' }
      })
      .compileComponents();
  });

  it('includes cash in the portfolio performance by default', () => {
    const fixture = TestBed.createComponent(GfHomeOverviewComponent);

    fixture.detectChanges();

    expect(dataService.fetchPortfolioPerformance).toHaveBeenCalledWith(
      expect.objectContaining({ includeCash: true })
    );
  });

  it('re-requests the portfolio performance without cash when disabled', () => {
    const component = TestBed.createComponent(
      GfHomeOverviewComponent
    ).componentInstance;

    component.onChangeIncludeCash(false);

    expect(dataService.fetchPortfolioPerformance).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeCash: false })
    );
  });
});
