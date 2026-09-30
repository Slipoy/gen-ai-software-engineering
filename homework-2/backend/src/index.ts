import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/client.js';
import { SqliteClassificationLog } from './repositories/sqliteClassificationLog.js';
import { SqliteTicketRepository } from './repositories/sqliteTicketRepository.js';
import { TicketService } from './services/ticketService.js';

const config = loadConfig();

// The composition root: the one place that decides which implementations the app runs with.
const database = openDatabase(config.dbPath);
const ticketService = new TicketService(new SqliteTicketRepository(database.db), {
  classificationLog: new SqliteClassificationLog(database.db),
});

const server = createApp({ ticketService }).listen(config.port, () => {
  console.log(`Support tickets API listening on http://localhost:${config.port} (database: ${config.dbPath})`);
});

// Finish in-flight requests, then close the database, before exiting (Ctrl+C locally, `docker stop` in a container).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      database.close();
      process.exit(0);
    });
  });
}
