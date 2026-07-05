const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const { corsOriginValidator } = require('./utils/cors.util');

const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const jemaatRoutes = require('./modules/jemaat/jemaat.routes');
const cellGroupRoutes = require('./modules/cellgroup/cellgroup.routes');
const volunteerRoutes = require('./modules/volunteer/volunteer.routes');
const eventRoutes = require('./modules/event/event.routes');
const auditlogRoutes = require('./modules/auditlog/auditlog.routes');
const reportRoutes = require('./modules/report/report.routes');
const notificationRoutes = require('./modules/notification/notification.routes');
const scoringRoutes = require('./modules/scoring/scoring.routes');

const app = express();

// Di belakang reverse proxy (nginx dsb): percayai 1 hop agar req.ip
// membaca X-Forwarded-For dan secure cookie bekerja benar.
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── Request logging ───────────────────────────────────────────────
// combined (Apache-style, lengkap) di production; dev (ringkas +
// warna) selama development. Dimatikan saat test agar output jest bersih.
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use(cors({ origin: corsOriginValidator, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────
// Nonaktif saat test agar supertest tidak terblokir. Counter gagal
// login per-username di Redis (auth.service) tetap berjalan terpisah.
if (process.env.NODE_ENV !== 'test') {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Terlalu banyak request, coba lagi nanti' },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Terlalu banyak percobaan, coba lagi nanti' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/refresh', authLimiter);
}

// ── Routes ────────────────────────────────────────────────────────
app.use('/', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', jemaatRoutes);
app.use('/api', cellGroupRoutes);
app.use('/api', volunteerRoutes);
app.use('/api', eventRoutes);
app.use('/api', auditlogRoutes);
app.use('/api', reportRoutes);
app.use('/api', notificationRoutes);
app.use('/api', scoringRoutes);

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint tidak ditemukan' });
});

// ── Global error boundary ─────────────────────────────────────────
// Mencegah stack trace bocor ke response di production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: isDev ? err.message : 'Terjadi kesalahan pada server',
    ...(isDev && { stack: err.stack }),
  });
});

module.exports = app;