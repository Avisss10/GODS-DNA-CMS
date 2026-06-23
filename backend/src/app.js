const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const jemaatRoutes = require('./modules/jemaat/jemaat.routes');
const cellGroupRoutes = require('./modules/cellgroup/cellgroup.routes');
const volunteerRoutes = require('./modules/volunteer/volunteer.routes');
const eventRoutes = require('./modules/event/event.routes');
const auditlogRoutes = require('./modules/auditlog/auditlog.routes');
const reportRoutes = require('./modules/report/report.routes');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', jemaatRoutes);
app.use('/api', cellGroupRoutes);
app.use('/api', volunteerRoutes);
app.use('/api', eventRoutes);
app.use('/api', auditlogRoutes);
app.use('/api', reportRoutes);

module.exports = app;