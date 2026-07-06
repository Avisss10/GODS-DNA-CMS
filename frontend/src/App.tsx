import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import AppInit from '@/routes/AppInit';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInit />
      <Toaster richColors closeButton />
    </QueryClientProvider>
  );
}

export default App;
