$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-File($Path, $Content) {
    $full = Join-Path (Get-Location) $Path
    $dir = Split-Path $full -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.File]::WriteAllText($full, $Content, $Utf8NoBom)
    Write-Host "Created: $Path"
}

Write-File "package.json" @'
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.2.8",
    "@hookform/resolvers": "^5.4.0",
    "@radix-ui/react-slot": "^1.3.0",
    "@tanstack/react-query": "^5.101.2",
    "@tanstack/react-table": "^8.21.3",
    "axios": "^1.18.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^12.42.2",
    "lucide-react": "^1.22.0",
    "next-themes": "^0.4.6",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-hook-form": "^7.80.0",
    "react-router-dom": "^7.18.1",
    "recharts": "^3.9.1",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.4.3",
    "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@tailwindcss/vite": "^4.3.2",
    "@types/node": "^24.13.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.3",
    "eslint": "^10.6.0",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.3",
    "globals": "^17.7.0",
    "prettier": "^3.9.4",
    "tailwindcss": "^4.3.2",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.62.1",
    "vite": "^8.1.1"
  }
}
'@

Write-File ".env.example" @'
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_NAME=GODS DNA CMS
'@

Write-File "components.json" @'
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
'@

Write-File "src\lib\utils.ts" @'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
'@

Write-File "src\index.css" @'
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: 'Inter', 'Segoe UI', system-ui, sans-serif;
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.625rem;
  --background: #f9fafb;
  --foreground: #111827;
  --card: #ffffff;
  --card-foreground: #111827;
  --popover: #ffffff;
  --popover-foreground: #111827;
  --primary: #f59e0b;
  --primary-foreground: #111827;
  --secondary: #f3f4f6;
  --secondary-foreground: #111827;
  --muted: #f3f4f6;
  --muted-foreground: #6b7280;
  --accent: #fef3c7;
  --accent-foreground: #92400e;
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #f59e0b;
  --sidebar: #111827;
  --sidebar-foreground: #f9fafb;
}

.dark {
  --background: #0b0d12;
  --foreground: #f9fafb;
  --card: #111827;
  --card-foreground: #f9fafb;
  --popover: #111827;
  --popover-foreground: #f9fafb;
  --primary: #f59e0b;
  --primary-foreground: #111827;
  --secondary: #1f2937;
  --secondary-foreground: #f9fafb;
  --muted: #1f2937;
  --muted-foreground: #9ca3af;
  --accent: #78350f;
  --accent-foreground: #fef3c7;
  --destructive: #f87171;
  --destructive-foreground: #111827;
  --border: #1f2937;
  --input: #1f2937;
  --ring: #f59e0b;
  --sidebar: #0b0d12;
  --sidebar-foreground: #f9fafb;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
'@

Write-File "vite.config.ts" @'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
'@

Write-File "tsconfig.json" @'
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }],
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
'@

Write-File "tsconfig.app.json" @'
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    },
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
'@

Write-File "eslint.config.js" @'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  prettierConfig
)
'@

Write-File ".prettierrc.json" @'
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
'@

Write-File ".prettierignore" @'
dist
node_modules
package-lock.json
'@

Write-File "src\vite-env.d.ts" @'
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_NAME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
'@

Write-File "src\constants\env.ts" @'
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  appName: import.meta.env.VITE_APP_NAME,
} as const
'@

Write-File "public\favicon.svg" @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="#111827"/>
  <path d="M22 14 C22 24, 42 24, 42 34 C42 44, 22 44, 22 54"
        stroke="#F59E0B" stroke-width="3.5" stroke-linecap="round" fill="none"/>
  <path d="M42 14 C42 24, 22 24, 22 34 C22 44, 42 44, 42 54"
        stroke="#F59E0B" stroke-width="3.5" stroke-linecap="round" fill="none" opacity="0.45"/>
  <line x1="24.5" y1="19" x2="39.5" y2="19" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="22.3" y1="29" x2="41.7" y2="29" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
  <line x1="22.3" y1="39" x2="41.7" y2="39" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
  <line x1="24.5" y1="49" x2="39.5" y2="49" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
</svg>
'@

Write-File "index.html" @'
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GODS DNA CMS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
'@

Write-File "src\main.tsx" @'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
'@

Write-File "src\components\shared\theme-provider.tsx" @'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  )
}
'@

Write-File "src\App.tsx" @'
import { ThemeProvider } from '@/components/shared/theme-provider'
import { Button } from '@/components/ui/button'

function App() {
  return (
    <ThemeProvider>
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background text-foreground">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">GODS DNA CMS</h1>
          <p className="text-muted-foreground text-sm">
            Frontend foundation berhasil disiapkan — Phase 11 selesai.
          </p>
        </div>
        <Button>Sacred Gold Theme</Button>
      </div>
    </ThemeProvider>
  )
}

export default App
'@

Write-File "src\components\ui\button.tsx" @'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
'@

Add-Content -Path ".gitignore" -Value "`n# Environment`n.env`n.env.*.local`n" -Encoding utf8NoBOM

Write-Host ""
Write-Host "=== SELESAI. Semua file berhasil dibuat tanpa BOM. ==="