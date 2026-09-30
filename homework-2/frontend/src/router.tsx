import { createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

/**
 * URL → screen map. Every screen renders inside <Layout> (header + nav).
 * Filters and the selected ticket will live in the URL (step B2), so a view can be bookmarked and shared.
 */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        index: true,
        element: <PlaceholderPage title="Queue" description="Open tickets grouped by priority. The board arrives in step B2." />,
      },
      {
        path: 'tickets',
        element: <PlaceholderPage title="All tickets" description="Every ticket with filters and search. Arrives in step B2." />,
      },
      {
        path: 'import',
        element: <PlaceholderPage title="Import" description="Upload CSV, JSON or XML files. Arrives in step B5." />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
