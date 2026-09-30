import { randomUUID } from 'node:crypto';
import type { NewTransactionInput, Transaction } from '../models/transaction.js';
import type { TransactionStore } from '../store/transactionStore.js';
import type { TransactionFilters } from '../validators/transactionValidator.js';
import { fromCents, roundMoney, toCents } from '../utils/money.js';

/** Amounts grouped by currency, e.g. `{ USD: 120.5, EUR: 10 }`. */
export type CurrencyAmounts = Record<string, number>;

export interface AccountSummary {
  accountId: string;
  totalDeposits: CurrencyAmounts;
  totalWithdrawals: CurrencyAmounts;
  totalTransfersIn: CurrencyAmounts;
  totalTransfersOut: CurrencyAmounts;
  transactionCount: number;
  mostRecentTransactionDate: string | null;
}

export interface InterestResult {
  accountId: string;
  rate: number;
  days: number;
  formula: string;
  balances: CurrencyAmounts;
  interest: CurrencyAmounts;
  projectedBalances: CurrencyAmounts;
}

const DAYS_IN_YEAR = 365;

const involves = (tx: Transaction, accountId: string) =>
  tx.fromAccount === accountId || tx.toAccount === accountId;

function addTo(bucket: Record<string, number>, currency: string, cents: number) {
  bucket[currency] = (bucket[currency] ?? 0) + cents;
}

function centsToAmounts(bucket: Record<string, number>): CurrencyAmounts {
  return Object.fromEntries(Object.entries(bucket).map(([currency, cents]) => [currency, fromCents(cents)]));
}

export class TransactionService {
  constructor(
    private readonly store: TransactionStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Creates a transaction and processes it immediately.
   * Withdrawals and transfers that exceed the available balance are stored with
   * status `failed` (the attempt is kept for audit) and do not change any balance.
   */
  create(input: NewTransactionInput, options: { timestamp?: string } = {}): Transaction {
    const transaction: Transaction = {
      id: randomUUID(),
      fromAccount: input.fromAccount ?? null,
      toAccount: input.toAccount ?? null,
      amount: input.amount,
      currency: input.currency,
      type: input.type,
      timestamp: options.timestamp ?? this.now().toISOString(),
      status: 'completed',
    };

    if (transaction.fromAccount) {
      const available = this.balanceCents(transaction.fromAccount)[transaction.currency] ?? 0;
      if (available < toCents(transaction.amount)) {
        transaction.status = 'failed';
        transaction.failureReason = `Insufficient funds: available ${fromCents(available)} ${transaction.currency}`;
      }
    }

    return this.store.add(transaction);
  }

  get(id: string): Transaction | undefined {
    return this.store.get(id);
  }

  list(filters: TransactionFilters = {}): Transaction[] {
    return this.store.list().filter((tx) => {
      if (filters.accountId && !involves(tx, filters.accountId)) return false;
      if (filters.type && tx.type !== filters.type) return false;
      const time = new Date(tx.timestamp).getTime();
      if (filters.from && time < filters.from.getTime()) return false;
      if (filters.to && time > filters.to.getTime()) return false;
      return true;
    });
  }

  /** An account "exists" once it appears in at least one transaction. */
  accountExists(accountId: string): boolean {
    return this.store.list().some((tx) => involves(tx, accountId));
  }

  /** Balance per currency, based on completed transactions only. */
  balance(accountId: string): CurrencyAmounts {
    return centsToAmounts(this.balanceCents(accountId));
  }

  summary(accountId: string): AccountSummary {
    const deposits: Record<string, number> = {};
    const withdrawals: Record<string, number> = {};
    const transfersIn: Record<string, number> = {};
    const transfersOut: Record<string, number> = {};
    let transactionCount = 0;
    let mostRecent: string | null = null;

    for (const tx of this.store.list()) {
      if (!involves(tx, accountId)) continue;

      transactionCount += 1;
      if (!mostRecent || tx.timestamp > mostRecent) mostRecent = tx.timestamp;
      if (tx.status !== 'completed') continue;

      const cents = toCents(tx.amount);
      if (tx.type === 'deposit') addTo(deposits, tx.currency, cents);
      else if (tx.type === 'withdrawal') addTo(withdrawals, tx.currency, cents);
      else if (tx.toAccount === accountId) addTo(transfersIn, tx.currency, cents);
      else addTo(transfersOut, tx.currency, cents);
    }

    return {
      accountId,
      totalDeposits: centsToAmounts(deposits),
      totalWithdrawals: centsToAmounts(withdrawals),
      totalTransfersIn: centsToAmounts(transfersIn),
      totalTransfersOut: centsToAmounts(transfersOut),
      transactionCount,
      mostRecentTransactionDate: mostRecent,
    };
  }

  /** Simple interest: I = P × r × (days / 365), where r is the annual rate (0.05 = 5%). */
  interest(accountId: string, rate: number, days: number): InterestResult {
    const balances = this.balance(accountId);
    const interest: CurrencyAmounts = {};
    const projectedBalances: CurrencyAmounts = {};

    for (const [currency, principal] of Object.entries(balances)) {
      const earned = principal > 0 ? roundMoney((principal * rate * days) / DAYS_IN_YEAR) : 0;
      interest[currency] = earned;
      projectedBalances[currency] = roundMoney(principal + earned);
    }

    return {
      accountId,
      rate,
      days,
      formula: 'interest = balance × rate × days / 365',
      balances,
      interest,
      projectedBalances,
    };
  }

  private balanceCents(accountId: string): Record<string, number> {
    const bucket: Record<string, number> = {};
    for (const tx of this.store.list()) {
      if (tx.status !== 'completed') continue;
      const cents = toCents(tx.amount);
      if (tx.toAccount === accountId) addTo(bucket, tx.currency, cents);
      if (tx.fromAccount === accountId) addTo(bucket, tx.currency, -cents);
    }
    return bucket;
  }
}
