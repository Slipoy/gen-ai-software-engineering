export const TRANSACTION_TYPES = ['deposit', 'withdrawal', 'transfer'] as const;
export const TRANSACTION_STATUSES = ['pending', 'completed', 'failed'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export interface Transaction {
  id: string;
  /** Source account. `null` for deposits (money comes from outside the bank). */
  fromAccount: string | null;
  /** Destination account. `null` for withdrawals (money leaves the bank). */
  toAccount: string | null;
  amount: number;
  currency: string;
  type: TransactionType;
  timestamp: string;
  status: TransactionStatus;
  /** Set only when `status` is `failed`. */
  failureReason?: string;
}

export interface NewTransactionInput {
  fromAccount?: string;
  toAccount?: string;
  amount: number;
  currency: string;
  type: TransactionType;
}
