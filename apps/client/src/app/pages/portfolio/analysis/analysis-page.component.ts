import { GfBenchmarkComparatorComponent } from '@ghostfolio/client/components/benchmark-comparator/benchmark-comparator.component';
import { GfInvestmentChartComponent } from '@ghostfolio/client/components/investment-chart/investment-chart.component';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { getTimeAxisDomain } from '@ghostfolio/common/chart-helper';
import {
  calculateBlendedBenchmarkData,
  parseBenchmarkSetting,
  serializeBenchmarkSetting
} from '@ghostfolio/common/benchmark-composition.helper';
import {
  DEFAULT_DATE_RANGE,
  NUMERICAL_PRECISION_THRESHOLD_6_FIGURES
} from '@ghostfolio/common/config';
import { canOpenHoldingDetail } from '@ghostfolio/common/helper';
import {
  BenchmarkAllocation,
  HistoricalDataItem,
  InvestmentItem,
  PortfolioInvestmentsResponse,
  PortfolioPerformance,
  PortfolioPosition,
  User
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { hasScope, scopes } from '@ghostfolio/common/scopes';
import type {
  AiPromptMode,
  GroupBy,
  ToggleOption
} from '@ghostfolio/common/types';
import { PerformanceCalculationType } from '@ghostfolio/common/types/performance-calculation-type.type';
import { translate } from '@ghostfolio/ui/i18n';
import { GfPremiumIndicatorComponent } from '@ghostfolio/ui/premium-indicator';
import { DataService } from '@ghostfolio/ui/services';
import { GfToggleComponent } from '@ghostfolio/ui/toggle';
import { GfValueComponent } from '@ghostfolio/ui/value';

import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { SymbolProfile } from '@prisma/client';
import { addIcons } from 'ionicons';
import { copyOutline, ellipsisVertical } from 'ionicons/icons';
import { isNumber, keyBy, sortBy, union } from 'lodash';
import ms from 'ms';
import { DeviceDetectorService } from 'ngx-device-detector';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { forkJoin } from 'rxjs';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfBenchmarkComparatorComponent,
    GfInvestmentChartComponent,
    GfPremiumIndicatorComponent,
    GfToggleComponent,
    GfValueComponent,
    IonIcon,
    MatButtonModule,
    MatCardModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    NgxSkeletonLoaderModule,
    RouterModule
  ],
  selector: 'gf-analysis-page',
  styleUrls: ['./analysis-page.scss'],
  templateUrl: './analysis-page.html'
})
export class GfAnalysisPageComponent implements OnInit {
  protected benchmarkAllocations: BenchmarkAllocation[] = [];
  protected benchmarkDataItems: HistoricalDataItem[] = [];
  protected benchmarkLabel = '';
  protected readonly benchmarks: Partial<SymbolProfile>[];
  protected bottom3: PortfolioPosition[];
  protected dividendsByGroup: InvestmentItem[];
  protected readonly dividendTimelineDataLabel = $localize`Dividend`;
  protected hasPermissionToReadAiPrompt: boolean;
  protected investments: InvestmentItem[];
  protected readonly investmentTimelineDataLabel = $localize`Invested Capital`;
  protected investmentsByGroup: InvestmentItem[];
  protected isLoadingAnalysisPrompt: boolean;
  protected isLoadingBenchmarkComparator: boolean;
  protected isLoadingDividendTimelineChart: boolean;
  protected isLoadingInvestmentChart: boolean;
  protected isLoadingInvestmentTimelineChart: boolean;
  protected isLoadingPortfolioPrompt: boolean;
  protected readonly mode = signal<GroupBy>('month');
  protected readonly modeOptions: ToggleOption<GroupBy>[] = [
    { label: $localize`Monthly`, value: 'month' },
    { label: $localize`Yearly`, value: 'year' }
  ];
  protected performance: PortfolioPerformance;
  protected readonly PerformanceCalculationType = PerformanceCalculationType;
  protected performanceDataItems: HistoricalDataItem[];
  protected performanceDataItemsInPercentage: HistoricalDataItem[];
  protected readonly portfolioEvolutionDataLabel = $localize`Investment`;
  protected readonly dateRangeOptions = [
    { label: $localize`Year to date`, value: 'ytd' },
    { label: $localize`1 month`, value: '1m' },
    { label: $localize`1 year`, value: '1y' },
    { label: $localize`5 years`, value: '5y' },
    { label: $localize`All time`, value: 'max' },
    { label: $localize`Custom range`, value: 'custom' }
  ];
  protected selectedDateRange = DEFAULT_DATE_RANGE;
  protected customStartDate = '';
  protected customEndDate = '';
  protected precision = 2;
  protected savingsRatePerMonth: number | undefined;
  protected streaks: PortfolioInvestmentsResponse['streaks'];
  protected top3: PortfolioPosition[];
  protected unitCurrentStreak: string;
  protected unitLongestStreak: string;
  protected user: User;

  private readonly actionsMenuButton = viewChild.required(MatMenuTrigger);
  private readonly deviceType = computed(
    () => this.deviceDetectorService.deviceInfo().deviceType
  );
  private dateOfFirstActivity: Date;
  private benchmarkDataRequestId = 0;

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly clipboard = inject(Clipboard);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deviceDetectorService = inject(DeviceDetectorService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly userService = inject(UserService);

  public constructor() {
    const { benchmarks } = this.dataService.fetchInfo();
    this.benchmarks = benchmarks;

    addIcons({ copyOutline, ellipsisVertical });
  }

  get savingsRate() {
    if (!this.savingsRatePerMonth) {
      return undefined;
    }

    return this.mode() === 'year'
      ? this.savingsRatePerMonth * 12
      : this.savingsRatePerMonth;
  }

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          if (this.selectedDateRange !== 'custom') {
            const userDateRange =
              this.user.settings?.dateRange ?? DEFAULT_DATE_RANGE;
            this.selectedDateRange = this.dateRangeOptions.some(
              ({ value }) => value === userDateRange
            )
              ? userDateRange
              : DEFAULT_DATE_RANGE;
          }

          this.benchmarkAllocations = parseBenchmarkSetting(
            this.user.settings?.benchmark
          );
          this.updateBenchmarkLabel();

          this.hasPermissionToReadAiPrompt = hasPermission(
            this.user.permissions,
            permissions.readAiPrompt
          );

          this.update();
        }

        this.changeDetectorRef.markForCheck();
      });
  }

  protected onChangeBenchmark(allocations: BenchmarkAllocation[]) {
    this.dataService
      .putUserSetting({ benchmark: serializeBenchmarkSetting(allocations) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.userService
          .get(true)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((user) => {
            this.user = user;
            this.benchmarkAllocations = parseBenchmarkSetting(
              this.user.settings?.benchmark
            );
            this.updateBenchmarkLabel();
            this.updateBenchmarkDataItems();

            this.changeDetectorRef.markForCheck();
          });
      });
  }

  protected onChangeGroupBy(aMode: GroupBy) {
    this.mode.set(aMode);
    this.fetchDividendsAndInvestments();
  }

  protected onDateRangeSelection(event: Event) {
    const dateRange = (event.target as HTMLSelectElement).value;

    this.selectedDateRange = dateRange;
    this.customStartDate = '';
    this.customEndDate = '';

    if (dateRange !== 'custom') {
      this.dataService
        .putUserSetting({ dateRange })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.userService
            .get(true)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
        });
    }
  }

  protected canApplyCustomDateRange() {
    return (
      !!this.customStartDate &&
      !!this.customEndDate &&
      this.customStartDate <= this.customEndDate
    );
  }

  protected applyCustomDateRange() {
    if (this.canApplyCustomDateRange()) {
      this.update(this.customStartDate, this.customEndDate);
    }
  }

  protected onCopyPromptToClipboard(mode: AiPromptMode) {
    if (mode === 'analysis') {
      this.isLoadingAnalysisPrompt = true;
    } else if (mode === 'portfolio') {
      this.isLoadingPortfolioPrompt = true;
    }

    this.dataService
      .fetchPrompt({
        mode,
        filters: this.userService.getFilters()
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ prompt }) => {
        this.clipboard.copy(prompt);

        const snackBarRef = this.snackBar.open(
          '✅ ' + $localize`AI prompt has been copied to the clipboard`,
          $localize`Open Duck.ai` + ' →',
          {
            duration: ms('7 seconds')
          }
        );

        snackBarRef
          .onAction()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            window.open('https://duck.ai', '_blank');
          });

        this.actionsMenuButton().closeMenu();

        if (mode === 'analysis') {
          this.isLoadingAnalysisPrompt = false;
        } else if (mode === 'portfolio') {
          this.isLoadingPortfolioPrompt = false;
        }

        this.changeDetectorRef.markForCheck();
      });
  }

  protected showValuesInPercentage() {
    return (
      !hasScope(this.user?.scopes, scopes.portfolioReadValues) ||
      this.user?.settings?.isRestrictedView
    );
  }

  /**
   * Returns the time (x) axis domain shared by all of the stacked time series
   * charts so that the same date is rendered at the same horizontal position
   * in every chart (Portfolio Evolution, Investment Timeline, Dividend
   * Timeline)
   */
  protected getTimeAxisDomain() {
    return getTimeAxisDomain([
      ...this.investments.map(({ date }) => date),
      ...this.performanceDataItems.map(({ date }) => date),
      ...this.investmentsByGroup.map(({ date }) => date),
      ...this.dividendsByGroup.map(({ date }) => date)
    ]);
  }

  private fetchDividendsAndInvestments() {
    this.isLoadingDividendTimelineChart = true;
    this.isLoadingInvestmentTimelineChart = true;

    forkJoin({
      dividends: this.dataService.fetchDividends({
        filters: this.userService.getFilters(),
        groupBy: this.mode(),
        range: this.user?.settings?.dateRange ?? DEFAULT_DATE_RANGE
      }),
      investments: this.dataService.fetchInvestments({
        filters: this.userService.getFilters(),
        groupBy: this.mode(),
        range: this.user?.settings?.dateRange ?? DEFAULT_DATE_RANGE
      })
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(
        ({
          dividends: { dividends },
          investments: { investments, savingsRate, streaks }
        }) => {
          // Expand both timelines to the union of their groups so that the
          // charts share the same axis, independent of whether a dividend or
          // an investment has been tracked in a given group
          const dividendByDate = keyBy(dividends, 'date');
          const investmentByDate = keyBy(investments, 'date');

          const dates = sortBy(
            union(Object.keys(dividendByDate), Object.keys(investmentByDate))
          );

          this.dividendsByGroup = dates.map((date) => {
            return {
              date,
              investment: dividendByDate[date]?.investment ?? 0
            };
          });

          this.investmentsByGroup = dates.map((date) => {
            return {
              date,
              investment: investmentByDate[date]?.investment ?? 0
            };
          });

          this.savingsRatePerMonth = savingsRate;
          this.streaks = streaks;

          this.unitCurrentStreak =
            this.mode() === 'year'
              ? this.streaks?.currentStreak === 1
                ? translate('YEAR')
                : translate('YEARS')
              : this.streaks?.currentStreak === 1
                ? translate('MONTH')
                : translate('MONTHS');

          this.unitLongestStreak =
            this.mode() === 'year'
              ? this.streaks?.longestStreak === 1
                ? translate('YEAR')
                : translate('YEARS')
              : this.streaks?.longestStreak === 1
                ? translate('MONTH')
                : translate('MONTHS');

          this.isLoadingDividendTimelineChart = false;
          this.isLoadingInvestmentTimelineChart = false;

          this.changeDetectorRef.markForCheck();
        }
      );
  }

  private update(
    startDate = this.selectedDateRange === 'custom'
      ? this.customStartDate || undefined
      : undefined,
    endDate = this.selectedDateRange === 'custom'
      ? this.customEndDate || undefined
      : undefined
  ) {
    this.isLoadingInvestmentChart = true;

    this.dataService
      .fetchPortfolioPerformance({
        endDate,
        filters: this.userService.getFilters(),
        range:
          this.selectedDateRange === 'custom'
            ? DEFAULT_DATE_RANGE
            : this.selectedDateRange,
        startDate
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ chart, dateOfFirstActivity, performance }) => {
        this.dateOfFirstActivity = dateOfFirstActivity ?? new Date();

        this.investments = [];
        this.performance = performance;
        this.performanceDataItems = [];
        this.performanceDataItemsInPercentage = [];

        for (const [
          index,
          {
            date,
            netPerformanceInPercentageWithCurrencyEffect,
            totalInvestmentValueWithCurrencyEffect,
            valueInPercentage,
            valueWithCurrencyEffect
          }
        ] of (chart ?? []).entries()) {
          // Ignore first item where value is 0
          if (index > 0 || this.selectedDateRange === 'max') {
            if (totalInvestmentValueWithCurrencyEffect !== undefined) {
              this.investments.push({
                date,
                investment: totalInvestmentValueWithCurrencyEffect
              });
            }

            this.performanceDataItems.push({
              date,
              value: isNumber(valueWithCurrencyEffect)
                ? valueWithCurrencyEffect
                : valueInPercentage
            });
          }

          this.performanceDataItemsInPercentage.push({
            date,
            value: netPerformanceInPercentageWithCurrencyEffect
          });
        }

        if (
          this.deviceType() === 'mobile' &&
          this.performance.currentValueInBaseCurrency >=
            NUMERICAL_PRECISION_THRESHOLD_6_FIGURES
        ) {
          this.precision = 0;
        }

        this.isLoadingInvestmentChart = false;

        this.updateBenchmarkDataItems();

        this.changeDetectorRef.markForCheck();
      });

    this.dataService
      .fetchPortfolioHoldings({
        filters: [
          ...this.userService.getFilters(),
          { id: 'ACTIVE', type: 'HOLDING_TYPE' }
        ],
        range: this.user?.settings?.dateRange
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ holdings }) => {
        const holdingsSorted = sortBy(
          holdings.filter((holding) => {
            return (
              canOpenHoldingDetail(holding) &&
              isNumber(holding.netPerformancePercentWithCurrencyEffect)
            );
          }),
          'netPerformancePercentWithCurrencyEffect'
        ).reverse();

        this.top3 = holdingsSorted
          .filter(
            ({ netPerformancePercentWithCurrencyEffect }) =>
              netPerformancePercentWithCurrencyEffect > 0
          )
          .slice(0, 3);

        this.bottom3 = holdingsSorted
          .filter(
            ({ netPerformancePercentWithCurrencyEffect }) =>
              netPerformancePercentWithCurrencyEffect < 0
          )
          .slice(-3)
          .reverse();

        this.changeDetectorRef.markForCheck();
      });

    this.fetchDividendsAndInvestments();

    this.changeDetectorRef.markForCheck();
  }

  private updateBenchmarkLabel() {
    this.benchmarkLabel = this.benchmarkAllocations
      .map(({ id, percentage }) => {
        const benchmark = this.benchmarks.find((item) => item.id === id);
        const name = benchmark?.symbol ?? benchmark?.name ?? id;
        return `${percentage}% ${name}`;
      })
      .join(' + ');
  }

  private updateBenchmarkDataItems() {
    const requestId = ++this.benchmarkDataRequestId;
    this.benchmarkDataItems = [];
    this.isLoadingBenchmarkComparator = false;

    const allocations = parseBenchmarkSetting(this.user?.settings?.benchmark);
    const benchmarkIdentifiers = allocations
      .map(({ id }) => {
        const benchmark = this.benchmarks.find((item) => item.id === id);

        return benchmark?.dataSource && benchmark.symbol
          ? { dataSource: benchmark.dataSource, symbol: benchmark.symbol }
          : undefined;
      })
      .filter(
        (
          benchmark
        ): benchmark is Pick<SymbolProfile, 'dataSource' | 'symbol'> =>
          Boolean(benchmark)
      );

    if (
      allocations.length === 0 ||
      benchmarkIdentifiers.length !== allocations.length
    ) {
      return;
    }

    this.isLoadingBenchmarkComparator = true;

    forkJoin(
      benchmarkIdentifiers.map(({ dataSource, symbol }) => {
        return this.dataService.fetchBenchmarkForUser({
          dataSource,
          symbol,
          filters: this.userService.getFilters(),
          range: this.user?.settings?.dateRange ?? DEFAULT_DATE_RANGE,
          startDate: this.dateOfFirstActivity
        });
      })
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        if (requestId !== this.benchmarkDataRequestId) {
          return;
        }

        const marketDataByBenchmark = Object.fromEntries(
          allocations.map(({ id }, index) => [id, results[index].marketData])
        );

        this.benchmarkDataItems = calculateBlendedBenchmarkData({
          allocations,
          dates: this.performanceDataItemsInPercentage.map(({ date }) => date),
          marketDataByBenchmark
        });
        this.isLoadingBenchmarkComparator = false;

        this.changeDetectorRef.markForCheck();
      });
  }
}
