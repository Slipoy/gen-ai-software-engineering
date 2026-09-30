import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { QueuePage } from './pages/QueuePage';
import { TicketsPage } from './pages/TicketsPage';

/**
 * URL → screen map. Every screen renders inside <Layout> (header + nav).
 * Filters and the selected ticket will live in the URL (step B2), so a view can be bookmarked and shared.
 */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <QueuePage /> },
      { path: 'tickets', element: <TicketsPage /> },
      {
        path: 'import',
        element: <PlaceholderPage title="Import" description="Upload CSV, JSON or XML files. Arrives in step B5." />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
