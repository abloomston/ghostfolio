-- Add optional mortgage terms to the Order activity (LIABILITY type).
ALTER TABLE "Order" ADD COLUMN "mortgageInterestRate" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "mortgageStartDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "mortgageTermYears" INTEGER;
ALTER TABLE "Order" ADD COLUMN "propertyValue" DOUBLE PRECISION;
