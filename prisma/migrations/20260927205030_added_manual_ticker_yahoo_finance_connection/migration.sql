-- CreateTable
CREATE TABLE "ManualTickerYahooFinanceConnection" (
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "anchorMarketPrice" DOUBLE PRECISION NOT NULL,
    "anchorYahooMarketPrice" DOUBLE PRECISION NOT NULL,
    "beta" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symbol" TEXT NOT NULL,
    "symbolProfileId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualTickerYahooFinanceConnection_pkey" PRIMARY KEY ("symbolProfileId")
);

-- AddForeignKey
ALTER TABLE "ManualTickerYahooFinanceConnection" ADD CONSTRAINT "ManualTickerYahooFinanceConnection_symbolProfileId_fkey" FOREIGN KEY ("symbolProfileId") REFERENCES "SymbolProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
