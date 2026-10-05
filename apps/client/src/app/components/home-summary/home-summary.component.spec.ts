import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { PortfolioDetails } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { TestBed } from '@angular/core/testing';
import '@angular/localize/init';
import { DeviceDetectorService } from 'ngx-device-detector';
import { of } from 'rxjs';

import { GfHomeSummaryComponent } from './home-summary.component';

jest.mock(
  '@ghostfolio/client/components/portfolio-summary/portfolio-summary.component',
  () => ({
    GfPortfolioSummaryComponent: class GfPortfolioSummaryComponent {}
  })
);
jest.mock('@ghostfolio/client/services/impersonation-storage.service', () => ({
  ImpersonationStorageService: class ImpersonationStorageService {}
}));
jest.mock('@ghostfolio/client/services/user/user.service', () => ({
  UserService: class UserService {}
}));
jest.mock('@ghostfolio/ui/services', () => ({
  DataService: class DataService {}
}));

describe('GfHomeSummaryComponent', () => {
  let dataService: jest.Mocked<
    Pick<DataService, 'fetchPortfolioDetails'>
  >;

  beforeEach(async () => {
    dataService = {
      fetchPortfolioDetails: jest
        .fn()
        .mockReturnValue(of({} as PortfolioDetails))
    };

    await TestBed.configureTestingModule({
      imports: [GfHomeSummaryComponent],
      providers: [
        {
          provide: UserService,
          useValue: {
            stateChanged: of({
              user: { permissions: [], scopes: [], settings: {} }
            })
          }
        },
        {
          provide: ImpersonationStorageService,
          useValue: { onChangeHasImpersonation: () => of(false) }
        },
        { provide: DataService, useValue: dataService },
        {
          provide: DeviceDetectorService,
          useValue: { deviceInfo: () => ({ deviceType: 'desktop' }) }
        }
      ]
    })
      .overrideComponent(GfHomeSummaryComponent, {
        set: { imports: [], template: '' }
      })
      .compileComponents();
  });

  it('includes cash in the portfolio summary by default', () => {
    const fixture = TestBed.createComponent(GfHomeSummaryComponent);

    fixture.detectChanges();

    expect(dataService.fetchPortfolioDetails).toHaveBeenCalledWith({
      includeCash: true
    });
  });

  it('re-requests the portfolio summary without cash when disabled', () => {
    const component = TestBed.createComponent(
      GfHomeSummaryComponent
    ).componentInstance;

    component.onChangeIncludeCash(false);

    expect(dataService.fetchPortfolioDetails).toHaveBeenLastCalledWith({
      includeCash: false
    });
  });
});
