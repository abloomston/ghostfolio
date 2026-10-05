import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { SubscriptionType } from '@ghostfolio/common/enums';
import { formatMonthAndYear } from '@ghostfolio/common/helper';
import {
  FireCalculationCompleteEvent,
  FireWealth,
  PortfolioDetails,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import {
  FireCalculatorService,
  GfFireCalculatorComponent
} from '@ghostfolio/ui/fire-calculator';
import { GfPremiumIndicatorComponent } from '@ghostfolio/ui/premium-indicator';
import { DataService } from '@ghostfolio/ui/services';
import { GfValueComponent } from '@ghostfolio/ui/value';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Big } from 'big.js';
import { DeviceDetectorService } from 'ngx-device-detector';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import {
  catchError,
  debounceTime,
  from,
  map,
  mergeMap,
  of,
  toArray
} from 'rxjs';

interface ExpectedReturnAsset {
  fiveYearReturn?: number;
  id: string;
  isCash?: boolean;
  name: string;
  tenYearReturn?: number;
  value: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    GfFireCalculatorComponent,
    GfPremiumIndicatorComponent,
    GfValueComponent,
    NgxSkeletonLoaderModule,
    ReactiveFormsModule
  ],
  providers: [FireCalculatorService],
  selector: 'gf-fire-page',
  styleUrls: ['./fire-page.scss'],
  templateUrl: './fire-page.html'
})
export class GfFirePageComponent implements OnInit {
  protected readonly deviceType = computed(
    () => this.deviceDetectorService.deviceInfo().deviceType
  );

  protected fireWealth: FireWealth;
  protected expectedReturnAssets: ExpectedReturnAsset[] = [];
  protected hasImpersonationId: boolean;
  protected hasPermissionToUpdateUserSettings: boolean;
  protected isLoading = false;
  protected retirementDate: Date;
  protected readonly cashInterestRateControl = new FormControl<number>(
    { value: 0, disabled: true },
    {
      nonNullable: true,
      validators: [
        (control) => Validators.required(control),
        Validators.min(-100),
        Validators.max(100)
      ]
    }
  );
  protected readonly safeWithdrawalRateControl = new FormControl<
    number | undefined
  >(undefined);
  protected readonly safeWithdrawalRateOptions = [
    0.025, 0.03, 0.035, 0.04, 0.045
  ] as const;
  protected user: User;
  protected withdrawalRatePerMonth: Big;
  protected withdrawalRatePerMonthProjected: Big;
  protected withdrawalRatePerYear: Big;
  protected withdrawalRatePerYearProjected: Big;

  private projectedPeriodInMonths: number;
  private projectedTotalAmount: number;

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deviceDetectorService = inject(DeviceDetectorService);
  private readonly fireCalculatorService = inject(FireCalculatorService);
  private readonly impersonationStorageService = inject(
    ImpersonationStorageService
  );
  private readonly userService = inject(UserService);

  protected get cashInterestRate(): number {
    return this.cashInterestRateControl.valid
      ? this.cashInterestRateControl.value
      : (this.user?.settings?.cashInterestRate ?? 0);
  }

  protected get expectedReturnEstimates() {
    return {
      fiveYear: this.fireCalculatorService.calculateWeightedPortfolioReturn(
        this.expectedReturnAssets.map(({ fiveYearReturn, isCash, value }) => ({
          annualizedReturn: isCash ? this.cashInterestRate : fiveYearReturn,
          value
        }))
      ),
      tenYear: this.fireCalculatorService.calculateWeightedPortfolioReturn(
        this.expectedReturnAssets.map(({ isCash, tenYearReturn, value }) => ({
          annualizedReturn: isCash ? this.cashInterestRate : tenYearReturn,
          value
        }))
      )
    };
  }

  protected get expectedReturnAssetsValue(): number {
    return this.expectedReturnAssets.reduce((sum, asset) => {
      return sum + asset.value;
    }, 0);
  }

  protected get retirementDateLabel(): string {
    const retirementDate =
      this.user?.settings?.retirementDate ?? this.retirementDate;

    if (!retirementDate) {
      return '';
    }

    return formatMonthAndYear({
      date: new Date(retirementDate),
      locale: this.user?.settings?.locale
    });
  }

  public ngOnInit() {
    this.isLoading = true;

    this.dataService
      .fetchPortfolioDetails()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ holdings, summary }) => {
        this.fireWealth = {
          today: {
            valueInBaseCurrency: summary?.fireWealth
              ? summary.fireWealth.today.valueInBaseCurrency
              : 0
          }
        };

        if (this.user.subscription?.type === SubscriptionType.Basic) {
          this.fireWealth = {
            today: {
              valueInBaseCurrency: 10000
            }
          };
        }

        this.fetchExpectedReturnAssets({
          cashValue: summary?.totalCashInBaseCurrency ?? 0,
          holdings
        });

        this.calculateWithdrawalRates();

        this.changeDetectorRef.markForCheck();
      });

    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;
        this.updateCashInterestRateControlState();

        this.changeDetectorRef.markForCheck();
      });

    this.safeWithdrawalRateControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.updateSafeWithdrawalRate(Number(value));
      });

    this.cashInterestRateControl.valueChanges
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (this.cashInterestRateControl.valid && Number.isFinite(value)) {
          this.updateCashInterestRate(value);
        }
      });

    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.hasPermissionToUpdateUserSettings =
            this.user.subscription?.type === SubscriptionType.Basic
              ? false
              : hasPermission(
                  this.user.permissions,
                  permissions.updateUserSettings
                );

          this.safeWithdrawalRateControl.setValue(
            this.user.settings.safeWithdrawalRate,
            { emitEvent: false }
          );
          this.cashInterestRateControl.setValue(
            this.user.settings.cashInterestRate ?? 0,
            { emitEvent: false }
          );

          this.updateCashInterestRateControlState();

          this.calculateWithdrawalRates();
          this.calculateWithdrawalRatesProjected();
        }

        this.changeDetectorRef.markForCheck();
      });
  }

  protected onExpectedReturnChange(expectedReturn: number) {
    // Keep the existing setting key so current users retain their return assumption.
    this.dataService
      .putUserSetting({ annualInterestRate: expectedReturn })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;
            this.calculateWithdrawalRatesProjected();

            this.changeDetectorRef.markForCheck();
          });
      });
  }

  protected onExpectedInflationRateChange(expectedInflationRate: number) {
    this.dataService
      .putUserSetting({ expectedInflationRate })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;
            this.calculateWithdrawalRatesProjected();

            this.changeDetectorRef.markForCheck();
          });
      });
  }

  protected onCalculationComplete({
    periodInMonths,
    projectedTotalAmount,
    retirementDate
  }: FireCalculationCompleteEvent) {
    this.projectedPeriodInMonths = periodInMonths;
    this.projectedTotalAmount = projectedTotalAmount;
    this.retirementDate = retirementDate;

    this.calculateWithdrawalRatesProjected();

    this.isLoading = false;
  }

  protected onProjectedTotalAmountChange(projectedTotalAmount: number) {
    this.dataService
      .putUserSetting({
        projectedTotalAmount,
        retirementDate: null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;
            this.calculateWithdrawalRatesProjected();

            this.changeDetectorRef.markForCheck();
          });
      });
  }

  protected onRetirementDateChange(retirementDate: Date) {
    this.dataService
      .putUserSetting({
        projectedTotalAmount: null,
        retirementDate: retirementDate.toISOString()
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;
            this.calculateWithdrawalRatesProjected();

            this.changeDetectorRef.markForCheck();
          });
      });
  }

  protected onSavingsRateChange(savingsRate: number) {
    this.dataService
      .putUserSetting({ savingsRate })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;
            this.calculateWithdrawalRatesProjected();

            this.changeDetectorRef.markForCheck();
          });
      });
  }

  private fetchExpectedReturnAssets({
    cashValue,
    holdings
  }: Pick<PortfolioDetails, 'holdings'> & { cashValue: number }) {
    const requests = holdings
      .filter(({ valueInBaseCurrency }) => {
        return (
          typeof valueInBaseCurrency === 'number' &&
          Number.isFinite(valueInBaseCurrency) &&
          valueInBaseCurrency > 0
        );
      })
      .map((holding) => {
        const { assetProfile, valueInBaseCurrency } = holding;

        const asset = {
          id: `${assetProfile.dataSource}:${assetProfile.symbol}`,
          name: assetProfile.name ?? assetProfile.symbol,
          value: valueInBaseCurrency ?? 0
        };

        return this.dataService
          .fetchHoldingDetail({
            dataSource: assetProfile.dataSource,
            symbol: assetProfile.symbol
          })
          .pipe(
            map(({ historicalData, marketPrice }) => ({
              ...asset,
              fiveYearReturn:
                this.fireCalculatorService.calculateAnnualizedReturnFromHistory(
                  {
                    currentPrice: marketPrice,
                    history: historicalData,
                    years: 5
                  }
                ),
              tenYearReturn:
                this.fireCalculatorService.calculateAnnualizedReturnFromHistory(
                  {
                    currentPrice: marketPrice,
                    history: historicalData,
                    years: 10
                  }
                )
            })),
            catchError(() =>
              of({
                ...asset,
                fiveYearReturn: undefined,
                tenYearReturn: undefined
              })
            )
          );
      });

    from(requests)
      .pipe(
        mergeMap((request) => request, 5),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((assets) => {
        this.expectedReturnAssets = [
          ...assets,
          {
            id: 'cash',
            isCash: true,
            name: $localize`Cash`,
            value: Number.isFinite(cashValue) ? Math.max(cashValue, 0) : 0
          }
        ];

        this.changeDetectorRef.markForCheck();
      });
  }

  private updateCashInterestRateControlState() {
    if (this.hasPermissionToUpdateUserSettings && !this.hasImpersonationId) {
      this.cashInterestRateControl.enable({ emitEvent: false });
    } else {
      this.cashInterestRateControl.disable({ emitEvent: false });
    }
  }

  private updateCashInterestRate(cashInterestRate: number) {
    this.dataService
      .putUserSetting({ cashInterestRate })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;
            this.changeDetectorRef.markForCheck();
          });
      });
  }

  private calculateWithdrawalRates() {
    if (this.fireWealth && this.user?.settings?.safeWithdrawalRate) {
      this.withdrawalRatePerYear = new Big(
        this.fireWealth.today.valueInBaseCurrency
      ).mul(this.user.settings.safeWithdrawalRate);

      this.withdrawalRatePerMonth = this.withdrawalRatePerYear.div(12);
    }
  }

  private calculateWithdrawalRatesProjected() {
    if (
      this.fireWealth &&
      this.projectedTotalAmount &&
      this.projectedPeriodInMonths !== undefined &&
      this.user?.settings?.safeWithdrawalRate
    ) {
      const projectedTotalAmountInTodayDollars =
        this.fireCalculatorService.calculatePresentValue({
          amount: this.projectedTotalAmount,
          expectedInflationRate:
            (this.user.settings.expectedInflationRate ?? 0) / 100,
          periodInMonths: this.projectedPeriodInMonths
        });

      this.withdrawalRatePerYearProjected =
        projectedTotalAmountInTodayDollars.mul(
          this.user.settings.safeWithdrawalRate
        );

      this.withdrawalRatePerMonthProjected =
        this.withdrawalRatePerYearProjected.div(12);
    }
  }

  private updateSafeWithdrawalRate(safeWithdrawalRate: number) {
    this.dataService
      .putUserSetting({ safeWithdrawalRate })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;

            this.calculateWithdrawalRates();
            this.calculateWithdrawalRatesProjected();

            this.changeDetectorRef.markForCheck();
          });
      });
  }
}
