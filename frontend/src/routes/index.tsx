import { createBrowserRouter } from 'react-router-dom';
import ThemePreview from '@/routes/ThemePreview';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <ThemePreview />,
  },
]);
