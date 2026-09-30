import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { query } from '@ghostfolio/api/helper/object.helper';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import {
  DataProviderInterface,
  GetAssetProfileParams,
  GetDividendsParams,
  GetHistoricalParams,
  GetQuotesParams,
  GetSearchParams
} from '@ghostfolio/api/services/data-provider/interfaces/data-provider.interface';
import { YahooFinanceService } from '@ghostfolio/api/services/data-provider/yahoo-finance/yahoo-finance.service';
import { FetchService } from '@ghostfolio/api/services/fetch/fetch.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import {
  DATE_FORMAT,
  extractNumberFromString,
  getStartOfUtcDate,
  getUtc,
  getStartOfUtcDateOfYesterday
} from '@ghostfolio/common/helper';
import {
  DataProviderHistoricalResponse,
  DataProviderInfo,
  DataProviderResponse,
  LookupResponse,
  ScraperConfiguration
} from '@ghostfolio/common/interfaces';

import { utc } from '@date-fns/utc';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  ManualTickerYahooFinanceConnection,
  SymbolProfile
} from '@prisma/client';
import * as cheerio from 'cheerio';
import { addDays, format, isAfter, isBefore, subDays } from 'date-fns';

import { calculateSyntheticMarketPrice } from './manual-ticker-yahoo-finance.helper';

@Injectable()
export class ManualService implements DataProviderInterface {
  private readonly logger = new Logger(ManualService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly fetchService: FetchService,
    private readonly prismaService: PrismaService,
    private readonly redisCacheService: RedisCacheService,
    private readonly symbolProfileService: SymbolProfileService,
    private readonly yahooFinanceService: YahooFinanceService
  ) {}

  public canHandle() {
    return true;
  }

  public async deleteYahooFinanceConnection({
    symbol,
    symbolProfileId
  }: {
    symbol: string;
    symbolProfileId: string;
  }) {
    await this.prismaService.manualTickerYahooFinanceConnection.deleteMany({
      where: { symbolProfileId }
    });

    await this.invalidateQuoteCache(symbol);
  }

  public async getAssetProfile({
    symbol
  }: GetAssetProfileParams): Promise<Partial<SymbolProfile>> {
    const [symbolProfile] = await this.symbolProfileService.getSymbolProfiles([
      { symbol, dataSource: this.getName() }
    ]);

    if (!symbolProfile) {
      return undefined;
    }

    return {
      symbol,
      currency: symbolProfile.currency,
      dataSource: this.getName(),
      name: symbolProfile.name
    };
  }

  public getDataProviderInfo(): DataProviderInfo {
    return {
      dataSource: DataSource.MANUAL,
      isPremium: false
    };
  }

  public async getDividends({}: GetDividendsParams) {
    return {};
  }

  public async getHistorical({
    from,
    symbol,
    to
  }: GetHistoricalParams): Promise<{
    [date: string]: DataProviderHistoricalResponse;
  }> {
    try {
      const symbolProfile = await this.prismaService.symbolProfile.findUnique({
        include: { manualTickerYahooFinanceConnection: true },
        where: {
          dataSource_symbol: { dataSource: this.getName(), symbol }
        }
      });

      if (!symbolProfile) {
        return {};
      }

      if (symbolProfile.manualTickerYahooFinanceConnection) {
        return this.getSyntheticHistoricalMarketData({
          connection: symbolProfile.manualTickerYahooFinanceConnection,
          from,
          symbol,
          to
        });
      }

      const { defaultMarketPrice, selector, url } =
        (symbolProfile.scraperConfiguration as unknown as Partial<ScraperConfiguration>) ??
        {};

      if (defaultMarketPrice) {
        const historical: {
          [date: string]: DataProviderHistoricalResponse;
        } = {};

        let date = from;

        while (isBefore(date, to)) {
          historical[format(date, DATE_FORMAT, { in: utc })] = {
            marketPrice: defaultMarketPrice
          };

          date = addDays(date, 1, { in: utc });
        }

        return historical;
      } else if (!selector || !url) {
        return {};
      }

      const value = await this.scrape({
        symbol,
        scraperConfiguration:
          symbolProfile.scraperConfiguration as unknown as ScraperConfiguration
      });

      return {
        [format(getStartOfUtcDateOfYesterday(), DATE_FORMAT, { in: utc })]: {
          marketPrice: value
        }
      };
    } catch (error) {
      throw new Error(
        `Could not get historical market data for ${symbol} (${this.getName()}) from ${format(
          from,
          DATE_FORMAT
        )} to ${format(to, DATE_FORMAT)}: [${error.name}] ${error.message}`
      );
    }
  }

  public getName(): DataSource {
    return DataSource.MANUAL;
  }

  public async getQuotes({
    symbols,
    useCache = true
  }: GetQuotesParams): Promise<{ [symbol: string]: DataProviderResponse }> {
    const response: { [symbol: string]: DataProviderResponse } = {};

    if (symbols.length <= 0) {
      return response;
    }

    try {
      const symbolProfiles = await this.prismaService.symbolProfile.findMany({
        include: { manualTickerYahooFinanceConnection: true },
        where: {
          dataSource: this.getName(),
          symbol: { in: symbols }
        }
      });

      const marketData = await this.prismaService.marketData.findMany({
        distinct: ['symbol'],
        orderBy: {
          date: 'desc'
        },
        take: symbols.length,
        where: {
          dataSource: this.getName(),
          symbol: {
            in: symbols
          }
        }
      });

      const yahooFinanceSymbols = Array.from(
        new Set(
          symbolProfiles
            .map(({ manualTickerYahooFinanceConnection }) => {
              return manualTickerYahooFinanceConnection?.symbol;
            })
            .filter((symbol): symbol is string => {
              return !!symbol;
            })
        )
      );

      const yahooQuotes = await this.yahooFinanceService.getQuotes({
        symbols: yahooFinanceSymbols
      });

      const connectedQuotes = new Map(
        await Promise.all(
          symbolProfiles
            .filter(({ manualTickerYahooFinanceConnection }) => {
              return !!manualTickerYahooFinanceConnection;
            })
            .map(async (symbolProfile) => {
              const connection =
                symbolProfile.manualTickerYahooFinanceConnection;

              if (!connection) {
                return [symbolProfile.symbol, undefined] as const;
              }

              const yahooQuote = yahooQuotes[connection.symbol];

              return [
                symbolProfile.symbol,
                yahooQuote
                  ? await this.getSyntheticQuote({
                      connection,
                      currency: symbolProfile.currency,
                      symbol: symbolProfile.symbol,
                      yahooMarketPrice: yahooQuote.marketPrice,
                      yahooMarketState: yahooQuote.marketState
                    })
                  : undefined
              ] as const;
            })
        )
      );

      const symbolProfilesToScrape = symbolProfiles.filter((symbolProfile) => {
        const scraperConfiguration =
          symbolProfile.scraperConfiguration as unknown as Partial<ScraperConfiguration>;

        return (
          !symbolProfile.manualTickerYahooFinanceConnection &&
          (scraperConfiguration?.mode === 'instant' || !useCache) &&
          scraperConfiguration?.selector &&
          scraperConfiguration?.url
        );
      });

      const scraperResultPromises = symbolProfilesToScrape.map(
        async ({ scraperConfiguration, symbol }) => {
          try {
            const marketPrice = await this.scrape({
              scraperConfiguration:
                scraperConfiguration as unknown as ScraperConfiguration,
              symbol
            });
            return { marketPrice, symbol };
          } catch (error) {
            this.logger.error(
              `Could not get quote for ${symbol} (${this.getName()}): [${error.name}] ${error.message}`
            );
            return { symbol, marketPrice: undefined };
          }
        }
      );

      const scraperResults = await Promise.all(scraperResultPromises);

      for (const { currency, symbol } of symbolProfiles) {
        const connectedQuote = connectedQuotes.get(symbol);
        let { marketPrice } =
          connectedQuote ??
          scraperResults.find((result) => {
            return result.symbol === symbol;
          }) ??
          {};

        marketPrice =
          marketPrice ??
          marketData.find((marketDataItem) => {
            return marketDataItem.symbol === symbol;
          })?.marketPrice ??
          0;

        response[symbol] = {
          currency,
          marketPrice,
          dataSource: this.getName(),
          marketState: connectedQuote?.marketState ?? 'delayed'
        };
      }

      return response;
    } catch (error) {
      this.logger.error(error.message);
    }

    return {};
  }

  public getTestSymbol() {
    return undefined;
  }

  public async search({
    query,
    userId
  }: GetSearchParams): Promise<LookupResponse> {
    const items = await this.prismaService.symbolProfile.findMany({
      select: {
        assetClass: true,
        assetSubClass: true,
        currency: true,
        dataSource: true,
        name: true,
        symbol: true,
        userId: true
      },
      where: {
        AND: [
          {
            dataSource: this.getName()
          },
          {
            OR: [
              {
                name: {
                  mode: 'insensitive',
                  startsWith: query
                }
              },
              {
                symbol: {
                  mode: 'insensitive',
                  startsWith: query
                }
              }
            ]
          },
          {
            OR: [{ userId }, { userId: null }]
          }
        ]
      }
    });

    return {
      items: items.map((item) => {
        return { ...item, dataProviderInfo: this.getDataProviderInfo() };
      })
    };
  }

  public async test({
    scraperConfiguration,
    symbol
  }: {
    scraperConfiguration: ScraperConfiguration;
    symbol: string;
  }) {
    return this.scrape({ scraperConfiguration, symbol });
  }

  public async updateYahooFinanceConnection({
    beta,
    symbol,
    symbolProfileId,
    yahooSymbol
  }: {
    beta: number;
    symbol: string;
    symbolProfileId: string;
    yahooSymbol: string;
  }) {
    yahooSymbol = yahooSymbol.trim();

    if (!yahooSymbol) {
      throw new BadRequestException('A Yahoo Finance ticker is required');
    }

    const anchorMarketPrice = await this.getAnchorMarketPrice({
      symbol,
      symbolProfileId
    });
    const { anchorDate, anchorYahooMarketPrice } =
      await this.getYahooFinanceAnchor(yahooSymbol);

    await this.prismaService.manualTickerYahooFinanceConnection.upsert({
      create: {
        anchorDate,
        anchorMarketPrice,
        anchorYahooMarketPrice,
        beta,
        symbol: yahooSymbol,
        symbolProfileId
      },
      update: {
        anchorDate,
        anchorMarketPrice,
        anchorYahooMarketPrice,
        beta,
        symbol: yahooSymbol
      },
      where: { symbolProfileId }
    });

    await this.invalidateQuoteCache(symbol);
  }

  private async getAnchorMarketPrice({
    symbol,
    symbolProfileId
  }: {
    symbol: string;
    symbolProfileId: string;
  }) {
    const today = getStartOfUtcDate(new Date());
    const latestMarketData = await this.prismaService.marketData.findFirst({
      orderBy: { date: 'desc' },
      select: { marketPrice: true },
      where: {
        dataSource: this.getName(),
        date: { lte: today },
        symbol
      }
    });

    if (latestMarketData?.marketPrice > 0) {
      return latestMarketData.marketPrice;
    }

    const latestActivity = await this.prismaService.order.findFirst({
      orderBy: { date: 'desc' },
      select: { unitPrice: true },
      where: {
        date: { lte: new Date() },
        symbolProfileId,
        unitPrice: { gt: 0 }
      }
    });

    if (latestActivity?.unitPrice > 0) {
      return latestActivity.unitPrice;
    }

    throw new BadRequestException(
      'A manual market price or activity price is required before connecting a Yahoo Finance ticker'
    );
  }

  private async getPreviousYahooMarketPrice({
    fallbackMarketPrice,
    symbol,
    to
  }: {
    fallbackMarketPrice: number;
    symbol: string;
    to: Date;
  }) {
    const historicalData = await this.yahooFinanceService.getHistorical({
      from: subDays(to, 14, { in: utc }),
      symbol,
      to
    });

    let marketPrice = fallbackMarketPrice;

    for (const [dateString, data] of Object.entries(historicalData).sort(
      ([dateStringA], [dateStringB]) => {
        return dateStringA.localeCompare(dateStringB);
      }
    )) {
      if (!isAfter(getUtc(dateString), to)) {
        marketPrice = data.marketPrice;
      }
    }

    return marketPrice;
  }

  private async getSyntheticHistoricalMarketData({
    connection,
    from,
    symbol,
    to
  }: {
    connection: ManualTickerYahooFinanceConnection;
    from: Date;
    symbol: string;
    to: Date;
  }): Promise<{ [date: string]: DataProviderHistoricalResponse }> {
    const anchorDate = getStartOfUtcDate(connection.anchorDate);
    const requestedEndDate = getStartOfUtcDate(to);
    const requestedStartDate = getStartOfUtcDate(from);

    if (isBefore(requestedEndDate, anchorDate)) {
      return {};
    }

    let calculationStartDate = anchorDate;
    let previousSyntheticMarketPrice = connection.anchorMarketPrice;

    if (isAfter(requestedStartDate, anchorDate)) {
      const latestSyntheticMarketData =
        await this.prismaService.marketData.findFirst({
          orderBy: { date: 'desc' },
          where: {
            dataSource: this.getName(),
            date: {
              gte: anchorDate,
              lt: requestedStartDate
            },
            symbol
          }
        });

      if (latestSyntheticMarketData) {
        calculationStartDate = getStartOfUtcDate(
          latestSyntheticMarketData.date
        );
        previousSyntheticMarketPrice = latestSyntheticMarketData.marketPrice;
      }
    }

    const yahooHistoricalData = await this.yahooFinanceService.getHistorical({
      from: subDays(calculationStartDate, 14, { in: utc }),
      symbol: connection.symbol,
      to: requestedEndDate
    });
    const yahooMarketPricesByDate = new Map(
      Object.entries(yahooHistoricalData)
    );
    let previousYahooMarketPrice = connection.anchorYahooMarketPrice;

    if (isAfter(calculationStartDate, anchorDate)) {
      for (const [dateString, data] of Object.entries(yahooHistoricalData).sort(
        ([dateStringA], [dateStringB]) => {
          return dateStringA.localeCompare(dateStringB);
        }
      )) {
        if (!isAfter(getUtc(dateString), calculationStartDate)) {
          previousYahooMarketPrice = data.marketPrice;
        }
      }
    }

    const historicalData: {
      [date: string]: DataProviderHistoricalResponse;
    } = {};
    let date = calculationStartDate;

    while (!isAfter(date, requestedEndDate)) {
      const dateString = format(date, DATE_FORMAT, { in: utc });
      const yahooMarketPrice =
        yahooMarketPricesByDate.get(dateString)?.marketPrice ??
        previousYahooMarketPrice;

      if (isAfter(date, calculationStartDate)) {
        previousSyntheticMarketPrice = calculateSyntheticMarketPrice({
          beta: connection.beta,
          previousSyntheticMarketPrice,
          previousYahooMarketPrice,
          yahooMarketPrice
        });
      }

      if (!isBefore(date, requestedStartDate)) {
        historicalData[dateString] = {
          marketPrice: previousSyntheticMarketPrice
        };
      }

      previousYahooMarketPrice = yahooMarketPrice;
      date = addDays(date, 1, { in: utc });
    }

    return historicalData;
  }

  private async getSyntheticQuote({
    connection,
    currency,
    symbol,
    yahooMarketPrice,
    yahooMarketState
  }: {
    connection: ManualTickerYahooFinanceConnection;
    currency: string;
    symbol: string;
    yahooMarketPrice: number;
    yahooMarketState: DataProviderResponse['marketState'];
  }): Promise<DataProviderResponse | undefined> {
    if (!yahooMarketPrice) {
      return undefined;
    }

    const today = getStartOfUtcDate(new Date());
    const anchorDate = getStartOfUtcDate(connection.anchorDate);
    const latestMarketData = await this.prismaService.marketData.findFirst({
      orderBy: { date: 'desc' },
      where: {
        dataSource: this.getName(),
        date: { lt: today },
        symbol
      }
    });
    const previousSyntheticMarketPrice =
      latestMarketData && !isBefore(latestMarketData.date, anchorDate)
        ? latestMarketData.marketPrice
        : connection.anchorMarketPrice;
    const previousYahooMarketPrice = await this.getPreviousYahooMarketPrice({
      fallbackMarketPrice: connection.anchorYahooMarketPrice,
      symbol: connection.symbol,
      to: subDays(today, 1, { in: utc })
    });

    return {
      currency,
      dataSource: this.getName(),
      marketPrice: calculateSyntheticMarketPrice({
        beta: connection.beta,
        previousSyntheticMarketPrice,
        previousYahooMarketPrice,
        yahooMarketPrice
      }),
      marketState: yahooMarketState
    };
  }

  private async getYahooFinanceAnchor(symbol: string) {
    const today = getStartOfUtcDate(new Date());
    let anchor: [string, DataProviderHistoricalResponse] | undefined;
    let latestMarketData: [string, DataProviderHistoricalResponse] | undefined;

    try {
      const historicalData = await this.yahooFinanceService.getHistorical({
        from: subDays(today, 14, { in: utc }),
        symbol,
        to: today
      });

      for (const entry of Object.entries(historicalData).sort(
        ([dateStringA], [dateStringB]) => {
          return dateStringA.localeCompare(dateStringB);
        }
      )) {
        const [dateString, data] = entry;

        if (data.marketPrice <= 0) {
          continue;
        }

        latestMarketData = entry;

        if (isBefore(getUtc(dateString), today)) {
          anchor = entry;
        }
      }
    } catch {}

    anchor = anchor ?? latestMarketData;

    if (!anchor) {
      throw new BadRequestException(
        `No Yahoo Finance market price could be found for ${symbol}`
      );
    }

    const [dateString, { marketPrice }] = anchor;

    return {
      anchorDate: getUtc(dateString),
      anchorYahooMarketPrice: marketPrice
    };
  }

  private async invalidateQuoteCache(symbol: string) {
    await this.redisCacheService.remove(
      this.redisCacheService.getQuoteKey({
        dataSource: this.getName(),
        symbol
      })
    );
  }

  private async scrape({
    scraperConfiguration,
    symbol
  }: {
    scraperConfiguration: ScraperConfiguration;
    symbol: string;
  }): Promise<number> {
    let locale = scraperConfiguration.locale;

    const response = await this.fetchService.fetch(scraperConfiguration.url, {
      headers: scraperConfiguration.headers as HeadersInit,
      signal: AbortSignal.timeout(
        this.configurationService.get('REQUEST_TIMEOUT')
      )
    });

    if (!response.ok) {
      throw new Error(
        `Failed to scrape the market price for ${symbol} (${this.getName()}): ${response.status} ${response.statusText} at ${scraperConfiguration.url}`
      );
    }

    let value: string;

    if (response.headers.get('content-type')?.includes('application/json')) {
      const object = await response.json();

      value = String(
        query({
          object,
          pathExpression: scraperConfiguration.selector
        })[0]
      );
    } else {
      const $ = cheerio.load(await response.text());

      if (!locale) {
        try {
          locale = $('html').attr('lang');
        } catch {}
      }

      value = $(scraperConfiguration.selector).first().text();

      const lines = value?.split('\n') ?? [];

      const lineWithDigits = lines.find((line) => {
        return /\d/.test(line);
      });

      if (lineWithDigits) {
        value = lineWithDigits;
      }

      return extractNumberFromString({
        locale,
        value
      });
    }

    return extractNumberFromString({ locale, value });
  }
}
