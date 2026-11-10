import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, createMemoryRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { connect, installPageFixes, IN_CHAT, onScreenRequested } from './widget/host';
import { ApiError } from './api/client';
import { AuthProvider, RequirePermission } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { ErrorFallback } from './components/ErrorFallback';
import { NoticeProvider } from './hooks/useNotice';
import './styles.css';

// Code-split by screen; the editor is the heavy one.
const PagesScreen = lazy(() => import('./features/pages/PagesScreen'));
const PageEditorScreen = lazy(() => import('./features/editor/PageEditorScreen'));
const ProductsScreen = lazy(() => import('./features/products/ProductsScreen'));
const RequestsScreen = lazy(() => import('./features/requests/RequestsScreen'));
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen'));
const AuditScreen = lazy(() => import('./features/audit/AuditScreen'));
const ComponentsScreen = lazy(() => import('./features/components/ComponentsScreen'));
const StudioScreen = lazy(() => import('./features/automation/StudioScreen'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A stopped admin, a missing file or a refusal won't fix itself by retrying.
      retry: (count, error) => !(error instanceof ApiError) && count < 1,
      refetchOnWindowFocus: true,
      staleTime: 2_000,
    },
  },
});

const routes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <Layout />
      </AuthProvider>
    ),
    errorElement: <ErrorFallback />,
    children: [
      { index: true, element: <Navigate to="/pages" replace /> },
      { path: 'pages', element: <PagesScreen />, errorElement: <ErrorFallback /> },
      { path: 'pages/:product/:module/:page', element: <PageEditorScreen />, errorElement: <ErrorFallback /> },
      { path: 'products', element: <ProductsScreen />, errorElement: <ErrorFallback /> },
      { path: 'requests', element: <RequestsScreen />, errorElement: <ErrorFallback /> },
      { path: 'automation', element: <StudioScreen kind="automation" />, errorElement: <ErrorFallback /> },
      { path: 'feedback', element: <StudioScreen kind="feedback" />, errorElement: <ErrorFallback /> },
      { path: 'audit', element: <AuditScreen />, errorElement: <ErrorFallback /> },
      {
        path: 'settings',
        element: (
          <RequirePermission permission="content:read" what="settings">
            <SettingsScreen />
          </RequirePermission>
        ),
        errorElement: <ErrorFallback />,
      },
      { path: 'components', element: <ComponentsScreen />, errorElement: <ErrorFallback /> },
      { path: '*', element: <Navigate to="/pages" replace /> },
    ],
  },
];

// Inside the chat there is no address bar, so the admin keeps its place in memory.
const router = IN_CHAT ? createMemoryRouter(routes, { initialEntries: ['/pages'] }) : createBrowserRouter(routes);
if (IN_CHAT) {
  void connect();
  installPageFixes();
  onScreenRequested((screen) => void router.navigate(`/${screen}`));
  // A new screen starts at the top, as it would after a page load on the web.
  let lastPath = router.state.location.pathname;
  router.subscribe((state) => {
    if (state.location.pathname !== lastPath) window.scrollTo(0, 0);
    lastPath = state.location.pathname;
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NoticeProvider>
        <RouterProvider router={router} />
      </NoticeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
