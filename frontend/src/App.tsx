import { ThemeProvider } from '@/components/shared/theme-provider'
import { Button } from '@/components/ui/button'

function App() {
  return (
    <ThemeProvider>
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background text-foreground">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">GODS DNA CMS</h1>
          <p className="text-muted-foreground text-sm">
            Frontend foundation berhasil disiapkan â€” Phase 11 selesai.
          </p>
        </div>
        <Button>Sacred Gold Theme</Button>
      </div>
    </ThemeProvider>
  )
}

export default App
