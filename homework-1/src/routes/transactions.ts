import { Router } from 'express';
import type { TransactionService } from '../services/transactionService.js';
import { transactionsToCsv } from '../utils/csv.js';
import { sendNotFound, sendValidationError } from '../utils/http.js';
import {
  validateNewTransaction,
  validateTransactionFilters,
} from '../validators/transactionValidator.js';

export function transactionsRouter(service: TransactionService): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const result = validateNewTransaction(req.body);
    if (!result.ok) return sendValidationError(res, result.errors);

    const transaction = service.create(result.value);
    res.status(201).location(`/transactions/${transaction.id}`).json(transaction);
  });

  router.get('/', (req, res) => {
    const result = validateTransactionFilters(req.query);
    if (!result.ok) return sendValidationError(res, result.errors);

    res.json(service.list(result.value));
  });

  // Declared before `/:id`, otherwise "export" would be treated as a transaction id.
  router.get('/export', (req, res) => {
    const { format = 'csv', ...filterQuery } = req.query;
    if (format !== 'csv') {
      return sendValidationError(res, [{ field: 'format', message: 'Only format=csv is supported' }]);
    }

    const result = validateTransactionFilters(filterQuery);
    if (!result.ok) return sendValidationError(res, result.errors);

    res
      .type('text/csv; charset=utf-8')
      .attachment('transactions.csv')
      .send(transactionsToCsv(service.list(result.value)));
  });

  router.get('/:id', (req, res) => {
    const transaction = service.get(req.params.id);
    if (!transaction) return sendNotFound(res, `Transaction ${req.params.id} not found`);

    res.json(transaction);
  });

  return router;
}
