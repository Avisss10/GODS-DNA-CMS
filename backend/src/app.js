const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

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

const app = express();

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({ origin: corsOriginValidator, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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