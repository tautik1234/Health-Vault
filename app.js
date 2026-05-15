require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

// Track DB connection state for fallback
let dbReady = false;
let dbError = null;

const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => { dbReady = true; console.log('Mongo connected'); })
    .catch(err => { dbError = err; console.error('Mongo connect failed, using mock data fallback:', err.message); });

  mongoose.connection.on('error', err => {
    if (!dbError) console.error('Mongo connection error; staying in mock mode:', err.message);
    dbReady = false;
    dbError = err;
  });
  mongoose.connection.on('disconnected', () => {
    dbReady = false;
    console.warn('Mongo disconnected; operating in mock mode');
  });
} else {
  console.warn('MONGO_URI not set. Running in mock fallback mode.');
}

// Models (still required; ensure FIELD_ENC_KEY is set for crypto usage)
const User = require('./models/User');
const HealthRecord = require('./models/HealthRecord');
const Appointment = require('./models/Appointment');

const app = express();
app.use(cors({ origin: '*', methods: 'GET,POST,PUT,DELETE,OPTIONS', allowedHeaders: 'Content-Type,Authorization' }));
app.use(bodyParser.json());

// Simple helper to decide if we should use mock mode explicitly
function useMock() {
  return !dbReady || process.env.FORCE_MOCK === 'true';
}

// Authentication Middleware (very basic mock token system)
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'No authorization header provided' });
    const token = authHeader.split(' ')[1];

    // In mock mode accept the static token. In DB mode you could extend to JWT verification.
    if (useMock()) {
      if (token !== (process.env.MOCK_TOKEN || 'mockToken')) {
        return res.status(403).json({ message: 'Invalid token (mock mode)' });
      }
      req.user = { id: 1, role: 'admin', mock: true };
      return next();
    }

    // Placeholder real verification – extend with JWT as needed
    if (token !== (process.env.API_TOKEN || 'mockToken')) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = { id: 1, role: 'admin', mock: false };
    next();
}

function authorize(roles = []) {
  if (typeof roles === 'string') roles = [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthenticated' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    next();
  };
}

// ---------------- Mock Data ----------------
const mockUsers = [
  { id: 1, username: 'alice', email: 'alice@example.com', role: 'admin', password: 'Password1!' },
  { id: 2, username: 'bob', email: 'bob@example.com', role: 'user', password: 'Password1!' }
];

let mockNextRecordId = 3;
const mockHealthRecords = [
  { recordId: 1, user: 1, recordDate: '2025-01-10T10:00:00.000Z', diagnosis: 'Hypertension', notes: 'Lifestyle changes advised', vitals: 'BP 140/90' },
  { recordId: 2, user: 2, recordDate: '2025-02-15T12:00:00.000Z', diagnosis: 'Seasonal Allergy', notes: 'Prescribed antihistamines', vitals: 'Temp 98.6F' }
];

let mockNextApptId = 3;
const mockAppointments = [
  { appointmentId: 1, user: 'alice', doctorName: 'Dr. Strange', datetime: '2025-09-15T09:00:00Z', notes: 'Follow-up', status: 'scheduled' },
  { appointmentId: 2, user: 'bob', doctorName: 'Dr. House', datetime: '2025-09-20T11:00:00Z', notes: 'Initial consult', status: 'scheduled' }
];

// Generic fallback responder
function respondWith(data, res, meta = {}) {
  res.json({ source: useMock() ? 'mock' : 'database', ...meta, data });
}

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ dbReady, dbError: dbError ? dbError.message : null, mockMode: useMock() });
});

// ---------------- Auth Routes ----------------
app.post('/register', async (req, res) => {
  if (useMock()) {
    const { username, email, password } = req.body;
    if (mockUsers.some(u => u.email === email || u.username === username)) {
      return res.status(400).json({ error: 'User exists (mock)' });
    }
    const id = mockUsers.length + 1;
    mockUsers.push({ id, username, email, role: 'user', password });
    return res.status(201).json({ message: 'user created (mock)', id, token: process.env.MOCK_TOKEN || 'mockToken' });
  }
  try {
    const { username, email, password } = req.body;
    const u = new User({ username, email, password , stats: req.body.stats || {} });
    await u.save();
  res.status(201).send({ message: 'user created', token: process.env.API_TOKEN || process.env.MOCK_TOKEN || 'mockToken' });
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (useMock()) {
    const user = mockUsers.find(u => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ error: 'invalid credentials (mock)' });
    return res.json({ message: 'ok (mock)', userId: user.id, token: process.env.MOCK_TOKEN || 'mockToken' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).send({ error: 'invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).send({ error: 'invalid credentials' });
    res.send({ message: 'ok', userId: user._id, token: process.env.API_TOKEN || 'mockToken' });
  } catch (err) {
    // On unexpected DB error fallback
    return res.status(503).json({ error: 'database error, fallback to mock suggested', detail: err.message });
  }
});

// ---------------- Health Records ----------------
app.post('/records', authenticate, async (req, res) => {
  if (useMock()) {
    const newRec = { recordId: mockNextRecordId++, recordDate: new Date().toISOString(), ...req.body };
    mockHealthRecords.push(newRec);
    return res.status(201).json({ message: 'created (mock)', recordId: newRec.recordId });
  }
  try {
    const rec = new HealthRecord(req.body);
    await rec.save();
    res.status(201).send({ id: rec._id, recordId: rec.recordId });
  } catch (err) {
    return res.status(503).json({ error: 'db failure, mock available', detail: err.message });
  }
});

app.get('/records/:recordId', authenticate, async (req, res) => {
  if (useMock()) {
    const r = mockHealthRecords.find(r => String(r.recordId) === req.params.recordId);
    if (!r) return res.status(404).json({ error: 'not found (mock)' });
    return respondWith(r, res);
  }
  try {
    const rec = await HealthRecord.findOne({ recordId: req.params.recordId });
    if (!rec) return res.status(404).send({ error: 'not found' });
    respondWith(rec.toDecrypted(), res);
  } catch (err) {
    return res.status(503).json({ error: 'db error', detail: err.message });
  }
});

app.delete('/records/:recordId', authenticate, async (req, res) => {
  if (useMock()) {
    const idx = mockHealthRecords.findIndex(r => String(r.recordId) === req.params.recordId);
    if (idx === -1) return res.status(404).json({ error: 'not found (mock)' });
    const removed = mockHealthRecords.splice(idx, 1)[0];
    return respondWith(removed, res, { message: 'deleted (mock)' });
  }
  try {
    const rec = await HealthRecord.findOneAndDelete({ recordId: req.params.recordId });
    if (!rec) return res.status(404).send({ error: 'not found' });
    respondWith(rec.toDecrypted(), res, { message: 'deleted' });
  } catch (err) {
    return res.status(503).json({ error: 'db error', detail: err.message });
  }
});

// ---------------- Appointments ----------------
app.post('/appointment', authenticate, async (req, res) => {
  if (useMock()) {
    const newAppt = { appointmentId: mockNextApptId++, status: 'scheduled', ...req.body };
    mockAppointments.push(newAppt);
    return res.status(201).json({ message: 'created (mock)', appointmentId: newAppt.appointmentId });
  }
  try {
    const a = new Appointment(req.body);
    await a.save();
    res.status(201).send({ id: a._id, appointmentId: a.appointmentId });
  } catch (err) {
    return res.status(503).json({ error: 'db error', detail: err.message });
  }
});

app.get('/appointment/:username', authenticate, async (req, res) => {
  if (useMock()) {
    const list = mockAppointments.filter(a => a.user === req.params.username);
    return respondWith(list, res);
  }
  try {
    const appts = await Appointment.find({ user: req.params.username });
    const de = appts.map(a => a.toDecrypted());
    respondWith(de, res);
  } catch (err) {
    return res.status(503).json({ error: 'db error', detail: err.message });
  }
});

// ---------------- Admin / Listing ----------------
app.get('/users', authenticate, authorize('admin'), (req, res) => {
  if (useMock()) {
    return respondWith(mockUsers.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role })), res);
  }
  User.find().select('username email createdAt')
    .then(users => respondWith(users, res))
    .catch(err => res.status(503).json({ error: 'db error', detail: err.message }));
});

app.get('/appointments', authenticate, (req, res) => {
  if (useMock()) return respondWith(mockAppointments, res);
  Appointment.find().then(list => respondWith(list.map(a => a.toDecrypted()), res))
    .catch(err => res.status(503).json({ error: 'db error', detail: err.message }));
});

app.get('/health-records', authenticate, (req, res) => {
  if (useMock()) return respondWith(mockHealthRecords, res);
  HealthRecord.find().then(list => respondWith(list.map(r => r.toDecrypted()), res))
    .catch(err => res.status(503).json({ error: 'db error', detail: err.message }));
});

// ---------- User Profile / Stats ----------
app.get('/me', authenticate, async (req, res) => {
  if (useMock()) {
    const me = mockUsers.find(u => u.id === 1); // static admin in mock
    return res.json({ source: 'mock', user: { username: me.username, email: me.email, stats: { bpm: 72, bp: '120/80', bmi: 22.5, weight: 70 } } });
  }
  try {
    const user = await User.findOne({ username: req.query.username }).lean();
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({ source: 'database', user: { username: user.username, email: user.email, stats: user.stats || {} } });
  } catch (e) {
    res.status(503).json({ error: 'db error', detail: e.message });
  }
});

// ---------- Reminders (mock only currently) ----------
const mockReminders = [
  { id: 1, type: 'Medication', text: 'Take Metformin (500mg) with breakfast', time: 'Today 08:00', icon: 'fa-pills' },
  { id: 2, type: 'Vaccination', text: 'Flu shot due this season', time: 'Before Oct 31', icon: 'fa-syringe' },
  { id: 3, type: 'Appointment', text: 'Cardiology follow-up', time: 'Tomorrow 14:30', icon: 'fa-stethoscope' }
];
app.get('/reminders', authenticate, (req, res) => {
  respondWith(mockReminders, res);
});

// ---------- Categories (mock) ----------
const mockCategories = [
  { icon: 'fa-allergies', name: 'Allergies', status: '2 active', action: 'Manage' },
  { icon: 'fa-heartbeat', name: 'Vitals', status: 'Updated today', action: 'View History' },
  { icon: 'fa-pills', name: 'Medications', status: '1 prescription', action: 'View All' },
  { icon: 'fa-syringe', name: 'Vaccinations', status: 'Up to date', action: 'View Records' }
];
app.get('/categories', authenticate, (req, res) => respondWith(mockCategories, res));

// ---------- Access Control (mock) ----------
const mockAccessList = [
  { id: 'doctorAccess', name: 'Dr. Shafali', role: 'Primary Care Physician', access: true, accessLabel: 'Full Access' },
  { id: 'allergistAccess', name: 'Dr. Robin Sharma', role: 'Allergist', access: false, accessLabel: 'Limited Access' },
  { id: 'emergencyAccess', name: 'Shalini', role: 'Emergency Contact', access: false, accessLabel: 'Emergency Only' }
];
app.get('/access', authenticate, (req, res) => respondWith(mockAccessList, res));

// --------------- Startup ---------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`listening on ${PORT} (mockMode=${useMock()})`));

// Diagnostics to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
