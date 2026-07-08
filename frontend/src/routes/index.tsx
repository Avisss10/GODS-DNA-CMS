import { createBrowserRouter, Navigate } from 'react-router-dom';
import LoginPage from '@/features/auth/LoginPage';
import AppLayout from '@/layouts/AppLayout';
import DashboardPage from '@/routes/DashboardPage';
import NotFoundPage from '@/routes/NotFoundPage';
import PlaceholderPage from '@/routes/PlaceholderPage';
import ProtectedRoute from '@/routes/ProtectedRoute';
import JemaatDetailPage from '@/features/jemaat/JemaatDetailPage';
import JemaatListPage from '@/features/jemaat/JemaatListPage';
import CellGroupListPage from '@/features/cellgroup/CellGroupListPage';
import CellGroupDetailPage from '@/features/cellgroup/CellGroupDetailPage';
import MeetingDetailPage from '@/features/cellgroup/MeetingDetailPage';
import VolunteerTypeListPage from '@/features/volunteer/VolunteerTypeListPage';
import EventListPage from '@/features/event/EventListPage';
import EventDetailPage from '@/features/event/EventDetailPage';
import ReportPage from '@/features/report/ReportPage';

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
          { path: '/jemaat', element: <JemaatListPage />, handle: { title: 'Jemaat' } },
          { path: '/jemaat/:id', element: <JemaatDetailPage />, handle: { title: 'Detail Jemaat' } },
          { path: '/cellgroup', element: <CellGroupListPage />, handle: { title: 'Cell Group' } },
          { path: '/cellgroup/:id', element: <CellGroupDetailPage />, handle: { title: 'Detail Cell Group' } },
          {
            path: '/cellgroup/meetings/:meetingId',
            element: <MeetingDetailPage />,
            handle: { title: 'Detail Meeting' },
          },
          { path: '/event', element: <EventListPage />, handle: { title: 'Event' } },
          { path: '/event/:id', element: <EventDetailPage />, handle: { title: 'Detail Event' } },
          { path: '/volunteer', element: <VolunteerTypeListPage />, handle: { title: 'Volunteer' } },
          { path: '/report', element: <ReportPage />, handle: { title: 'Report' } },
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