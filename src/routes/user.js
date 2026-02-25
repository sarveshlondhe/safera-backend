const express        = require('express');
const { auth }       = require('../middleware/auth');
const router         = express.Router();
router.use(auth);

const toItems = v => {
  if (Array.isArray(v))      return v.map(s => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

// TODAY TIFFIN
router.get('/today-tiffin', async (req, res) => {
  try {
    const DailyTiffin    = require('../models/DailyTiffin');
    const UserTiffinLog  = require('../models/UserTiffinLog');
    const PersonalTiffin = require('../models/PersonalTiffin');

    const today  = new Date().toISOString().split('T')[0];
    const tiffin = await DailyTiffin.findOne({ date: today });
    let log = null;

    if (tiffin && tiffin._id) {
      log = await UserTiffinLog.findOne({ userId: req.user._id, date: today });
      if (!log) {
        try {
          log = await UserTiffinLog.create({
            userId:   req.user._id,
            tiffinId: tiffin._id,
            date:     today,
            price:    tiffin.price,
            status:   'pending',
          });
        } catch(e) {
          // If log creation fails (e.g. duplicate), just find existing
          log = await UserTiffinLog.findOne({ userId: req.user._id, date: today });
        }
      }
    }

    const personal = await PersonalTiffin.find({ userId: req.user._id, date: today });
    res.json({ tiffin, log, personal });
  } catch (err) {
    console.error('TODAY TIFFIN ERR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// HISTORY
router.get('/history', async (req, res) => {
  try {
    const UserTiffinLog  = require('../models/UserTiffinLog');
    const PersonalTiffin = require('../models/PersonalTiffin');
    const { month } = req.query;
    const mq = month ? { $regex: `^${month}` } : undefined;
    const [logs, personal] = await Promise.all([
      UserTiffinLog.find({ userId: req.user._id, ...(mq ? {date:mq} : {}) }).populate('tiffinId').sort({ date: -1 }),
      PersonalTiffin.find({ userId: req.user._id, ...(mq ? {date:mq} : {}) }).sort({ date: -1 }),
    ]);
    const total         = logs.reduce((s,l) => s+l.price, 0);
    const personalTotal = personal.reduce((s,p) => s+p.price, 0);
    res.json({ logs, personal, total, personalTotal, grandTotal: total + personalTotal });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// TOTALS
router.get('/total', async (req, res) => {
  try {
    const UserTiffinLog  = require('../models/UserTiffinLog');
    const PersonalTiffin = require('../models/PersonalTiffin');
    const m = req.query.month || new Date().toISOString().slice(0, 7);
    const [allLogs, allPersonal] = await Promise.all([
      UserTiffinLog.find({ userId: req.user._id }),
      PersonalTiffin.find({ userId: req.user._id }),
    ]);
    const ml = allLogs.filter(l => l.date.startsWith(m));
    const mp = allPersonal.filter(p => p.date.startsWith(m));
    res.json({
      month: m,
      monthlyTotal:  ml.reduce((s,l)=>s+l.price,0) + mp.reduce((s,p)=>s+p.price,0),
      overallTotal:  allLogs.reduce((s,l)=>s+l.price,0) + allPersonal.reduce((s,p)=>s+p.price,0),
      monthlyDays:   ml.length + mp.length,
      totalDays:     allLogs.length + allPersonal.length,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CALENDAR
router.get('/calendar', async (req, res) => {
  try {
    const DailyTiffin    = require('../models/DailyTiffin');
    const UserTiffinLog  = require('../models/UserTiffinLog');
    const PersonalTiffin = require('../models/PersonalTiffin');
    const m = req.query.month || new Date().toISOString().slice(0, 7);
    const [logs, personal, tiffins] = await Promise.all([
      UserTiffinLog.find({ userId: req.user._id, date: { $regex: `^${m}` } }).populate('tiffinId'),
      PersonalTiffin.find({ userId: req.user._id, date: { $regex: `^${m}` } }),
      DailyTiffin.find({ date: { $regex: `^${m}` } }),
    ]);
    const cal = {};
    tiffins.forEach(t  => { cal[t.date] = { ...cal[t.date], adminTiffin: t }; });
    logs.forEach(l     => { cal[l.date] = { ...cal[l.date], log: l }; });
    personal.forEach(p => {
      if (!cal[p.date]) cal[p.date] = {};
      if (!cal[p.date].personal) cal[p.date].personal = [];
      cal[p.date].personal.push(p);
    });
    res.json({ calendar: cal, month: m });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// SKIP TIFFIN
router.patch('/log/:date/skip', async (req, res) => {
  try {
    const UserTiffinLog = require('../models/UserTiffinLog');
    const log = await UserTiffinLog.findOneAndUpdate(
      { userId: req.user._id, date: req.params.date },
      { status: 'skipped' }, { new: true }
    );
    if (!log) return res.status(404).json({ message: 'No log found for this date.' });
    res.json({ log });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD PERSONAL TIFFIN  ← This saves to PersonalTiffin collection, NOT UserTiffinLog
router.post('/personal-tiffin', async (req, res) => {
  try {
    const PersonalTiffin = require('../models/PersonalTiffin');
    const { date, title, items, price } = req.body;
    if (!date || !title || price == null)
      return res.status(400).json({ message: 'date, title and price are required.' });

    const tiffin = await PersonalTiffin.create({
      userId:  req.user._id,
      date:    date,
      title:   title.trim(),
      items:   toItems(items),
      price:   Number(price),
      addedBy: 'user',
    });
    res.status(201).json({ message: 'Added!', tiffin });
  } catch (err) {
    console.error('PERSONAL TIFFIN ERR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// DELETE PERSONAL TIFFIN
router.delete('/personal-tiffin/:id', async (req, res) => {
  try {
    const PersonalTiffin = require('../models/PersonalTiffin');
    const t = await PersonalTiffin.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!t) return res.status(404).json({ message: 'Not found.' });
    res.json({ message: 'Deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;