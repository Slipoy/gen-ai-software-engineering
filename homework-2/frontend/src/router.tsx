import { createBrowserRouter, type RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { NotFoundPage } from './pages/NotFoundPage';
import { QueuePage } from './pages/QueuePage';
import { TicketsPage } from './pages/TicketsPage';

/**
 * URL → screen map. Every screen renders inside <Layout> (header + nav).
 * Filters and the selected ticket live in the URL, so a view can be bookmarked and shared.
 * The import page is loaded lazily: its code is a separate file fetched only when someone opens it,
 * so the queue (the screen agents open all day) loads less JavaScript.
 */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <QueuePage /> },
      { path: 'tickets', element: <TicketsPage /> },
      {
        path: 'import',
        lazy: async () => ({ Component: (await import('./pages/ImportPage')).ImportPage }),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/** The app's router. Tests build a memory router from the same `routes`. */
export const router = createBrowserRouter(routes);
