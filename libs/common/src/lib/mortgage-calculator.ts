import { addMonths, isAfter } from 'date-fns';

export type MortgageTermYears = 15 | 30;

export interface MortgageTerms {
  annualInterestRate: number;
  principal: number;
  startDate: Date;
  termYears: MortgageTermYears;
}

export interface MortgagePayment {
  balance: number;
  date: Date;
  interest: number;
  payment: number;
  paymentNumber: number;
  principal: number;
}

/**
 * The subset of an activity (Order) needed to reconstruct the mortgage terms
 * carried on a LIABILITY activity. The original principal is the activity
 * value (quantity * unitPrice).
 */
export interface MortgageActivity {
  mortgageInterestRate: number | null | undefined;
  mortgageStartDate: Date | null | undefined;
  mortgageTermYears: number | null | undefined;
  quantity: number;
  unitPrice: number;
}

/**
 * Creates a monthly amortization table for a fixed-rate mortgage. The start
 * date is the loan origination date; the first installment is due one month
 * later. Amounts are rounded to cents and the final installment clears the
 * remaining balance.
 */
export function calculateMortgageAmortizationSchedule({
  annualInterestRate,
  principal,
  startDate,
  termYears
}: MortgageTerms): MortgagePayment[] {
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new RangeError('Mortgage principal must be a positive number.');
  }

  if (!Number.isFinite(annualInterestRate) || annualInterestRate < 0) {
    throw new RangeError(
      'Mortgage interest rate must be a non-negative number.'
    );
  }

  if (!(termYears === 15 || termYears === 30)) {
    throw new RangeError('Mortgage term must be 15 or 30 years.');
  }

  if (!(startDate instanceof Date) || !Number.isFinite(startDate.getTime())) {
    throw new RangeError('Mortgage start date must be a valid date.');
  }

  const numberOfPayments = termYears * 12;
  const monthlyInterestRate = annualInterestRate / 100 / 12;
  const regularPayment = roundToCents(
    monthlyInterestRate === 0
      ? principal / numberOfPayments
      : (principal * monthlyInterestRate) /
          (1 - Math.pow(1 + monthlyInterestRate, -numberOfPayments))
  );

  let balance = roundToCents(principal);
  const payments: MortgagePayment[] = [];

  for (
    let paymentNumber = 1;
    paymentNumber <= numberOfPayments;
    paymentNumber++
  ) {
    const interest = roundToCents(balance * monthlyInterestRate);
    const principalPayment = roundToCents(
      Math.min(balance, regularPayment - interest)
    );
    const payment = roundToCents(interest + principalPayment);
    balance = roundToCents(Math.max(0, balance - principalPayment));

    payments.push({
      balance,
      date: addMonths(startDate, paymentNumber),
      interest,
      payment,
      paymentNumber,
      principal: principalPayment
    });
  }

  // Correct any cent-rounding remainder in the final installment.
  const finalPayment = payments.at(-1);
  if (finalPayment && finalPayment.balance > 0) {
    finalPayment.principal = roundToCents(
      finalPayment.principal + finalPayment.balance
    );
    finalPayment.payment = roundToCents(
      finalPayment.interest + finalPayment.principal
    );
    finalPayment.balance = 0;
  }

  return payments;
}

/**
 * Returns only installments due on or before `asOfDate`, so callers creating
 * synthetic payment transactions never pre-populate future transactions.
 */
export function getMortgagePaymentsDue({
  asOfDate,
  ...mortgage
}: MortgageTerms & { asOfDate: Date }): MortgagePayment[] {
  if (!(asOfDate instanceof Date) || !Number.isFinite(asOfDate.getTime())) {
    throw new RangeError('As-of date must be a valid date.');
  }

  return calculateMortgageAmortizationSchedule(mortgage).filter(
    ({ date }) => !isAfter(date, asOfDate)
  );
}

/**
 * Returns the mortgage terms stored on a liability activity, or `null` when
 * the activity does not carry a complete mortgage definition (i.e. it is a
 * plain liability without a fixed-rate amortization schedule).
 */
export function getMortgageTermsFromActivity(
  activity: MortgageActivity
): MortgageTerms | null {
  const { mortgageInterestRate, mortgageStartDate, mortgageTermYears } =
    activity;

  if (
    typeof mortgageInterestRate !== 'number' ||
    mortgageInterestRate < 0 ||
    !mortgageStartDate ||
    (mortgageTermYears !== 15 && mortgageTermYears !== 30)
  ) {
    return null;
  }

  return {
    annualInterestRate: mortgageInterestRate,
    principal: roundToCents(activity.quantity * activity.unitPrice),
    startDate: new Date(mortgageStartDate),
    termYears: mortgageTermYears
  };
}

/**
 * Returns the outstanding mortgage principal remaining after every
 * installment due on or before `asOfDate` has been applied. Before the first
 * installment the full principal remains; after the final installment it is 0.
 */
export function getMortgageOutstandingBalance(
  mortgage: MortgageTerms,
  asOfDate: Date
): number {
  const duePayments = getMortgagePaymentsDue({ asOfDate, ...mortgage });

  return duePayments.length > 0
    ? duePayments[duePayments.length - 1].balance
    : roundToCents(mortgage.principal);
}

/** Calculates a property's value after annual compound growth. */
export function calculateFuturePropertyValue({
  annualGrowthRate,
  periodInMonths,
  propertyValue
}: {
  annualGrowthRate: number;
  periodInMonths: number;
  propertyValue: number;
}): number {
  if (!Number.isFinite(propertyValue) || propertyValue < 0) {
    throw new RangeError('Property value must be a non-negative number.');
  }

  if (!Number.isFinite(annualGrowthRate) || annualGrowthRate <= -100) {
    throw new RangeError('Annual property growth must be greater than -100%.');
  }

  if (!Number.isFinite(periodInMonths) || periodInMonths < 0) {
    throw new RangeError(
      'Projection period must be a non-negative number of months.'
    );
  }

  return roundToCents(
    propertyValue * Math.pow(1 + annualGrowthRate / 100, periodInMonths / 12)
  );
}

function roundToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
