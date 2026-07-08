import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design token "Slate Modern"
        sidebar: '#CBD4DF',
        surface: '#D9DFE7',
        modul: {
          jemaat: '#2563EB',
          cellgroup: '#0D9488',
          event: '#EA580C',
          volunteer: '#9333EA',
          report: '#DB2777',
          auditlog: '#64748B',
          // Varian teks — dipakai KHUSUS untuk text-modul-*Text, bukan bg/ikon.
          // Semua sudah dihitung >= 4.5:1 vs background card (#F1F4F8).
          jemaatText: '#1D4ED8',
          cellgroupText: '#0F766E',
          eventText: '#C2410C',
          volunteerText: '#7E22CE',
          reportText: '#BE185D',
          auditlogText: '#475569',
        },
        status: {
          aktif: '#16A34A',
          kurangAktif: '#D97706',
          tidakAktif: '#DC2626',
          belumData: '#64748B',
          // idem — varian teks kontras tinggi
          aktifText: '#15803D',
          kurangAktifText: '#B45309',
          tidakAktifText: '#B91C1C',
          belumDataText: '#475569',
        },
          // shadcn/ui (CSS variables) — digabung dengan token accent & card
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          from: '#4F46E5',
          to: '#EC4899',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: '#F1F4F8',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
        pill: '20px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
