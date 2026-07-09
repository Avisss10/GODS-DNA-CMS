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
          // Saturasi dinaikkan tipis (+8%, hue tetap sama) dari baseline lama
          // supaya tidak terkesan pucat. Semua *Text sudah dicek ulang, tetap >= 4.5:1.
          jemaat: '#1B5FF5',
          cellgroup: '#079A8D',
          event: '#F45502',
          volunteer: '#932AF3',
          report: '#E51D76',
          auditlog: '#5A7295',
          // Varian teks — dipakai KHUSUS untuk text-modul-*Text, bukan bg/ikon.
          // Semua sudah dihitung >= 4.5:1 vs background card (#F1F4F8).
          jemaatText: '#1349E2',
          cellgroupText: '#0A7B72',
          eventText: '#CA3E04',
          volunteerText: '#7F18D8',
          reportText: '#C70F5C',
          auditlogText: '#405470',
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
      boxShadow: {
        // Bayangan berlapis & halus — pengganti shadow default Tailwind yang keras.
        soft: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 1px 0 rgb(15 23 42 / 0.03)',
        card: '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.05)',
        'card-hover': '0 8px 16px -4px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
        sidebar: '1px 0 0 0 rgb(15 23 42 / 0.04), 4px 0 12px -4px rgb(15 23 42 / 0.06)',
        topbar: '0 1px 0 0 rgb(15 23 42 / 0.05), 0 4px 12px -6px rgb(15 23 42 / 0.08)',
        popover: '0 12px 32px -8px rgb(15 23 42 / 0.16), 0 4px 12px -4px rgb(15 23 42 / 0.08)',
      },
      backgroundImage: {
        'sidebar-gradient': 'linear-gradient(180deg, #CFD8E3 0%, #CBD4DF 45%, #C4CEDA 100%)',
        shimmer: 'linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.35) 50%, transparent 100%)',
      },
      transitionDuration: {
        DEFAULT: '175ms',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
