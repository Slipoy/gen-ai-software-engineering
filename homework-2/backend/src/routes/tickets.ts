import { Router } from 'express';
import multer from 'multer';
import { HttpError, ValidationError } from '../errors.js';
import { detectFormat } from '../importers/index.js';
import type { ImportService } from '../services/importService.js';
import type { TicketService } from '../services/ticketService.js';
import { validateTicketFilters } from '../validators/filterValidator.js';
import { validateNewTicket, validateTicketUpdate } from '../validators/ticketValidator.js';

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Parses `multipart/form-data` uploads (the format browsers use for <input type="file">).
 * The file is kept in memory: import files are small and are parsed right away, so nothing touches the disk.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
});

/**
 * HTTP layer for /tickets. Each handler does the same three things:
 * validate the input → call the service → turn the result into a response.
 * Errors are thrown, not handled here: Express 5 forwards rejected promises to the error handler.
 */
export function ticketsRouter(service: TicketService, importer: ImportService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const result = validateNewTicket(req.body);
    if (!result.ok) throw new ValidationError(result.errors);

    const ticket = await service.create(result.value);
    res.status(201).location(`/tickets/${ticket.id}`).json(ticket);
  });

  // Declared before `/:id` routes for readability; POST /:id does not exist, so there is no clash.
  router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'No file uploaded', 'Send the file as multipart/form-data in a field named "file"');
    }

    const format = detectFormat({
      format: req.query.format,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    const summary = await importer.importFile(format, req.file.buffer.toString('utf8'));
    res.status(200).json(summary);
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
