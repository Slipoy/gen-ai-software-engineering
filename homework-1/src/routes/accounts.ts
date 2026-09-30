import { Router, type NextFunction, type Request, type Response } from 'express';
import type { TransactionService } from '../services/transactionService.js';
import { sendNotFound, sendValidationError } from '../utils/http.js';
import { isValidAccountId, type FieldError } from '../validators/transactionValidator.js';

const MAX_INTEREST_DAYS = 36_500;

export function accountsRouter(service: TransactionService): Router {
  const router = Router();

  // Shared guard for every /accounts/:accountId/* route: 400 on a malformed id, 404 on an unknown one.
  const requireAccount = (req: Request<{ accountId: string }>, res: Response, next: NextFunction) => {
    const { accountId } = req.params;
    if (!isValidAccountId(accountId)) {
      return sendValidationError(res, [
        { field: 'accountId', message: 'Account number must follow the format ACC-XXXXX (X is alphanumeric)' },
      ]);
    }
    if (!service.accountExists(accountId)) {
      return sendNotFound(res, `Account ${accountId} has no transactions`);
    }
    next();
  };

  router.get('/:accountId/balance', requireAccount, (req, res) => {
    const { accountId } = req.params;
    res.json({ accountId, balances: service.balance(accountId) });
  });

  router.get('/:accountId/summary', requireAccount, (req, res) => {
    res.json(service.summary(req.params.accountId));
  });

  router.get('/:accountId/interest', requireAccount, (req, res) => {
    const errors: FieldError[] = [];
    const rate = Number(req.query.rate);
    const days = Number(req.query.days);

    if (typeof req.query.rate !== 'string' || req.query.rate === '' || !Number.isFinite(rate) || rate < 0 || rate > 1) {
      errors.push({ field: 'rate', message: 'rate must be an annual rate between 0 and 1 (e.g. 0.05 for 5%)' });
    }
    if (typeof req.query.days !== 'string' || !Number.isInteger(days) || days < 1 || days > MAX_INTEREST_DAYS) {
      errors.push({ field: 'days', message: `days must be an integer between 1 and ${MAX_INTEREST_DAYS}` });
    }
    if (errors.length > 0) return sendValidationError(res, errors);

    res.json(service.interest(req.params.accountId, rate, days));
  });

  return router;
}
