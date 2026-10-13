import { ImportModule } from '@ghostfolio/api/app/import/import.module';
import { PortfolioModule } from '@ghostfolio/api/app/portfolio/portfolio.module';
import { SymbolModule } from '@ghostfolio/api/app/symbol/symbol.module';
import { UserModule } from '@ghostfolio/api/app/user/user.module';
import { environment } from '@ghostfolio/api/environments/environment';
import { getMcpUserOfBearerToken } from '@ghostfolio/api/helper/bearer-token.helper';
import { ApiModule } from '@ghostfolio/api/services/api/api.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { PortfolioTableModule } from '@ghostfolio/api/services/portfolio-table/portfolio-table.module';
import { MCP_ENDPOINT } from '@ghostfolio/common/config';

import { Module } from '@nestjs/common';
import {
  MCP_STRATEGY,
  McpStrategy,
  StreamableHttpTransport
} from '@rekog/mcp-nest';

import { GhostfolioMcpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  controllers: [GhostfolioMcpController],
  imports: [
    ApiModule,
    ConfigurationModule,
    ImportModule,
    PortfolioModule,
    PortfolioTableModule,
    SymbolModule,
    UserModule
  ],
  providers: [
    McpService,
    {
      inject: [ConfigurationService],
      provide: MCP_STRATEGY,
      useFactory: (configurationService: ConfigurationService) => {
        const { hostname } = new URL(configurationService.get('ROOT_URL'));

        return new McpStrategy({
          instructions:
            'Ghostfolio is a wealth management application. The tools read the portfolio and the watchlist of the user who granted the access, import activities into the portfolio and project the FIRE calculator. They give no quantity and no monetary value of the portfolio (except the unit price of an activity), unless the access has the scope to read the monetary values, which the tools of the FIRE calculator use to give the actual amounts. Only the tools which the permission of the access covers are listed. To import activities, the access needs the permission "Restricted view and manage" or "View and manage".',
          name: 'ghostfolio',
          resolveUser: getMcpUserOfBearerToken,
          title: 'Ghostfolio',
          transports: [
            new StreamableHttpTransport({
              endpoint: MCP_ENDPOINT,
              security: {
                allowedHosts: [hostname],
                allowedOrigins: [hostname]
              }
            })
          ],
          version: environment.version,
          websiteUrl: 'https://ghostfol.io'
        });
      }
    }
  ]
})
export class McpModule {}
