import { createBrowserRouter, Navigate } from 'react-router-dom';
import LoginPage from '@/features/auth/LoginPage';
import AppLayout from '@/layouts/AppLayout';
import DashboardPage from '@/routes/DashboardPage';
import NotFoundPage from '@/routes/NotFoundPage';
import PlaceholderPage from '@/routes/PlaceholderPage';
import ProtectedRoute from '@/routes/ProtectedRoute';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <DashboardPage />, handle: { title: 'Dashboard' } },
          { path: '/jemaat', element: <PlaceholderPage title="Jemaat" />, handle: { title: 'Jemaat' } },
          { path: '/cellgroup', element: <PlaceholderPage title="Cell Group" />, handle: { title: 'Cell Group' } },
          { path: '/event', element: <PlaceholderPage title="Event" />, handle: { title: 'Event' } },
          { path: '/volunteer', element: <PlaceholderPage title="Volunteer" />, handle: { title: 'Volunteer' } },
          { path: '/report', element: <PlaceholderPage title="Report" />, handle: { title: 'Report' } },
          {
            element: <ProtectedRoute allowedRoles={['LEADER']} />,
            children: [
              { path: '/audit-log', element: <PlaceholderPage title="Audit Log" />, handle: { title: 'Audit Log' } },
              { path: '/notification', element: <PlaceholderPage title="Notification" />, handle: { title: 'Notification' } },
              {
                path: '/user-management',
                element: <PlaceholderPage title="User Management" />,
                handle: { title: 'User Management' },
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
