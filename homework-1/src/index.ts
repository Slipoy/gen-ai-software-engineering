import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { TransactionService } from './services/transactionService.js';
import { TransactionStore } from './store/transactionStore.js';
import { validateNewTransaction } from './validators/transactionValidator.js';

const PORT = Number(process.env.PORT ?? 3000);
const SEED_FILE = process.env.SEED_FILE;

const service = new TransactionService(new TransactionStore());

/** Loads demo transactions (same shape as the POST body, plus an optional timestamp). */
function seed(file: string) {
  const records = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;
  const sorted = [...records].sort((a, b) => String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')));

  for (const [index, record] of sorted.entries()) {
    const result = validateNewTransaction({ ...record, timestamp: undefined });
    if (!result.ok) {
      throw new Error(`Invalid seed record #${index}: ${JSON.stringify(result.errors)}`);
    }
    service.create(result.value, { timestamp: typeof record.timestamp === 'string' ? record.timestamp : undefined });
  }
  console.log(`Seeded ${sorted.length} transactions from ${file}`);
}

if (SEED_FILE) seed(SEED_FILE);

createApp({ service }).listen(PORT, () => {
  console.log(`Banking Transactions API listening on http://localhost:${PORT}`);
});
