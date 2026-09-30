import type { Transaction } from '../models/transaction.js';

/**
 * In-memory storage. Data lives only as long as the process does (as required by the task).
 * Insertion order is kept, so `list()` returns transactions oldest first.
 */
export class TransactionStore {
  private readonly items = new Map<string, Transaction>();

  add(transaction: Transaction): Transaction {
    this.items.set(transaction.id, transaction);
    return transaction;
  }

  get(id: string): Transaction | undefined {
    return this.items.get(id);
  }

  list(): Transaction[] {
    return [...this.items.values()];
  }

  clear(): void {
    this.items.clear();
  }
}
