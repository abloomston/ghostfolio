import { UserService } from '@ghostfolio/client/services/user/user.service';
import { DataService } from '@ghostfolio/ui/services';

import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { Router } from '@angular/router';
import { DeviceDetectorService } from 'ngx-device-detector';
import { of } from 'rxjs';

import { GfHomeHoldingsComponent } from './home-holdings.component';

jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class UserService {}
}));
jest.mock('@ghostfolio/ui/holdings-table', () => ({
  GfHoldingsTableComponent: class GfHoldingsTableComponent {}
}));
jest.mock('@ghostfolio/ui/services', () => ({
  DataService: class DataService {}
}));
jest.mock('@ghostfolio/ui/toggle', () => ({
  GfToggleComponent: class GfToggleComponent {}
}));
jest.mock('@ghostfolio/ui/treemap-chart', () => ({
  GfTreemapChartComponent: class GfTreemapChartComponent {}
}));

describe('GfHomeHoldingsComponent', () => {
  let dataService: jest.Mocked<Pick<DataService, 'fetchPortfolioHoldings'>>;

  beforeEach(async () => {
    dataService = {
      fetchPortfolioHoldings: jest.fn().mockReturnValue(of({ holdings: [] }))
    };

    await TestBed.configureTestingModule({
      imports: [GfHomeHoldingsComponent],
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
        { provide: DataService, useValue: dataService },
        {
          provide: DeviceDetectorService,
          useValue: { getDeviceInfo: () => ({ deviceType: 'desktop' }) }
        },
        { provide: Router, useValue: { navigate: jest.fn() } }
      ]
    })
      .overrideComponent(GfHomeHoldingsComponent, {
        set: { imports: [], template: '' }
      })
      .compileComponents();
  });

  it('includes cash in the portfolio holdings by default', () => {
    const fixture = TestBed.createComponent(GfHomeHoldingsComponent);

    fixture.detectChanges();

    expect(dataService.fetchPortfolioHoldings).toHaveBeenCalledWith(
      expect.objectContaining({ includeCash: true })
    );
  });
});
