import { Router } from 'express';
import { ValidationError } from '../errors.js';
import type { TicketService } from '../services/ticketService.js';
import { validateTicketFilters } from '../validators/filterValidator.js';
import { validateNewTicket, validateTicketUpdate } from '../validators/ticketValidator.js';

/**
 * HTTP layer for /tickets. Each handler does the same three things:
 * validate the input → call the service → turn the result into a response.
 * Errors are thrown, not handled here: Express 5 forwards rejected promises to the error handler.
 */
export function ticketsRouter(service: TicketService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const result = validateNewTicket(req.body);
    if (!result.ok) throw new ValidationError(result.errors);

    const ticket = await service.create(result.value);
    res.status(201).location(`/tickets/${ticket.id}`).json(ticket);
  });

  router.get('/', async (req, res) => {
    const result = validateTicketFilters(req.query);
    if (!result.ok) throw new ValidationError(result.errors);

    res.json(await service.list(result.value));
  });

  router.get('/:id', async (req, res) => {
    res.json(await service.get(req.params.id));
  });

  router.put('/:id', async (req, res) => {
    const result = validateTicketUpdate(req.body);
    if (!result.ok) throw new ValidationError(result.errors);

    res.json(await service.update(req.params.id, result.value));
  });

  router.delete('/:id', async (req, res) => {
    await service.delete(req.params.id);
    res.status(204).end();
  });

  return router;
}
