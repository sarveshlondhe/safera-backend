const express = require("express");
const router = express.Router();

const { auth, adminOnly } = require("../middleware/auth");
const User = require("../models/User");
const DailyTiffin = require("../models/DailyTiffin");
const UserTiffinLog = require("../models/UserTiffinLog");
const PersonalTiffin = require("../models/PersonalTiffin");

const toItems = (v) => {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
};

router.use(auth, adminOnly);

/**
 * ✅ ADMIN STATS
 * GET /api/admin/stats
 */
router.get("/stats", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const month = new Date().toISOString().slice(0, 7);

    const [activeUsers, totalTiffins, pendingDeliveries, pendingApprovals, todayTiffin] =
      await Promise.all([
        User.countDocuments({ role: "user", isApproved: true, isActive: true }),
        DailyTiffin.countDocuments({}),
        UserTiffinLog.countDocuments({ status: "pending" }),
        User.countDocuments({ role: "user", isApproved: false }),
        DailyTiffin.findOne({ date: today }),
      ]);

    const allLogs = await UserTiffinLog.find({ status: { $ne: "skipped" } });
    const allPersonal = await PersonalTiffin.find({});

    const totalRevenue =
      allLogs.reduce((s, l) => s + (l.price || 0), 0) +
      allPersonal.reduce((s, p) => s + (p.price || 0), 0);

    const thisMonthRevenue =
      allLogs.filter((l) => l.date?.startsWith(month)).reduce((s, l) => s + (l.price || 0), 0) +
      allPersonal.filter((p) => p.date?.startsWith(month)).reduce((s, p) => s + (p.price || 0), 0);

    res.json({
      totalUsers: activeUsers,
      totalTiffins,
      totalRevenue,
      thisMonthRevenue,
      pendingDeliveries,
      pendingApprovals,
      todayDone: !!todayTiffin,
      todayTiffin,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ GET USERS (with totals)
 * GET /api/admin/users
 */
router.get("/users", async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const users = await User.find({ role: "user" })
      .select("-passwordHash")
      .sort({ createdAt: -1 });

    const [logs, personal] = await Promise.all([
      UserTiffinLog.find({ status: { $ne: "skipped" } }),
      PersonalTiffin.find({}),
    ]);

    const totalByUser = {};
    const monthByUser = {};

    for (const l of logs) {
      const uid = String(l.userId);
      totalByUser[uid] = (totalByUser[uid] || 0) + (l.price || 0);
      if (l.date?.startsWith(month)) {
        monthByUser[uid] = (monthByUser[uid] || 0) + (l.price || 0);
      }
    }

    for (const p of personal) {
      const uid = String(p.userId);
      totalByUser[uid] = (totalByUser[uid] || 0) + (p.price || 0);
      if (p.date?.startsWith(month)) {
        monthByUser[uid] = (monthByUser[uid] || 0) + (p.price || 0);
      }
    }

    res.json(
      users.map((u) => ({
        ...u.toObject(),
        totalBill: totalByUser[String(u._id)] || 0,
        thisMonthTotal: monthByUser[String(u._id)] || 0,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ PENDING USERS
 * GET /api/admin/pending-users
 */
router.get("/pending-users", async (req, res) => {
  try {
    const users = await User.find({ role: "user", isApproved: false }).select("-passwordHash");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ APPROVE USER
 * PATCH /api/admin/users/:id/approve
 */
router.patch("/users/:id/approve", async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true });
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Approved", user: { id: u._id, isApproved: u.isApproved } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ REJECT (DELETE) USER
 * DELETE /api/admin/users/:id/reject
 */
router.delete("/users/:id/reject", async (req, res) => {
  try {
    const uid = req.params.id;

    await Promise.all([
      User.findByIdAndDelete(uid),
      UserTiffinLog.deleteMany({ userId: uid }),
      PersonalTiffin.deleteMany({ userId: uid }),
    ]);

    res.json({ message: "Rejected & deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ TOGGLE ACTIVE
 * PATCH /api/admin/users/:id/toggle
 */
router.patch("/users/:id/toggle", async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ message: "User not found" });

    u.isActive = !u.isActive;
    await u.save();

    res.json({ message: "Updated", isActive: u.isActive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ TIFFIN LIST
 * GET /api/admin/tiffin?month=YYYY-MM
 */
router.get("/tiffin", async (req, res) => {
  try {
    const { month } = req.query;
    const q = month ? { date: { $regex: `^${month}` } } : {};
    const tiffins = await DailyTiffin.find(q).sort({ date: -1 });
    res.json(tiffins);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ CREATE / UPSERT TIFFIN BY DATE
 * POST /api/admin/tiffin
 */
router.post("/tiffin", async (req, res) => {
  try {
    const { date, title, items, price } = req.body;
    if (!date || !title || price == null)
      return res.status(400).json({ message: "date, title, price required" });

    const t = await DailyTiffin.findOneAndUpdate(
      { date },
      {
        date,
        title: title.trim(),
        items: toItems(items),
        price: Number(price),
        createdBy: req.user._id,
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: "Saved", tiffin: t });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ UPDATE TIFFIN
 * PUT /api/admin/tiffin/:id
 */
router.put("/tiffin/:id", async (req, res) => {
  try {
    const { title, items, price } = req.body;

    const t = await DailyTiffin.findByIdAndUpdate(
      req.params.id,
      {
        ...(title ? { title: title.trim() } : {}),
        ...(items ? { items: toItems(items) } : {}),
        ...(price != null ? { price: Number(price) } : {}),
      },
      { new: true }
    );

    if (!t) return res.status(404).json({ message: "Tiffin not found" });
    res.json({ message: "Updated", tiffin: t });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ DELETE TIFFIN
 * DELETE /api/admin/tiffin/:id
 */
router.delete("/tiffin/:id", async (req, res) => {
  try {
    const t = await DailyTiffin.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: "Tiffin not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ USER LOGS + PERSONAL (for bills page)
 * GET /api/admin/users/:uid/logs?month=YYYY-MM
 */
router.get("/users/:uid/logs", async (req, res) => {
  try {
    const { month } = req.query;
    const mq = month ? { date: { $regex: `^${month}` } } : {};
    const uid = req.params.uid;

    const [logs, personal] = await Promise.all([
      UserTiffinLog.find({ userId: uid, ...mq }).populate("tiffinId").sort({ date: -1 }),
      PersonalTiffin.find({ userId: uid, ...mq }).sort({ date: -1 }),
    ]);

    const logsTotal = logs
      .filter((l) => l.status !== "skipped")
      .reduce((s, l) => s + (l.price || 0), 0);

    const personalTotal = personal.reduce((s, p) => s + (p.price || 0), 0);

    res.json({ logs, personal, total: logsTotal + personalTotal });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ DELIVERY STATUS
 */
router.patch("/log/:id/delivered", async (req, res) => {
  try {
    const l = await UserTiffinLog.findByIdAndUpdate(req.params.id, { status: "delivered" }, { new: true });
    if (!l) return res.status(404).json({ message: "Log not found" });
    res.json({ message: "Done" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/log/:id/pending", async (req, res) => {
  try {
    const l = await UserTiffinLog.findByIdAndUpdate(req.params.id, { status: "pending" }, { new: true });
    if (!l) return res.status(404).json({ message: "Log not found" });
    res.json({ message: "Done" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/users/:uid/deliver-all", async (req, res) => {
  try {
    const { month } = req.query;
    const mq = month ? { date: { $regex: `^${month}` } } : {};

    await UserTiffinLog.updateMany(
      { userId: req.params.uid, status: { $ne: "skipped" }, ...mq },
      { status: "delivered" }
    );

    res.json({ message: "All delivered" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * ✅ ADMIN ADD PERSONAL TIFFIN FOR USER
 * POST /api/admin/users/:uid/personal-tiffin
 */
router.post("/users/:uid/personal-tiffin", async (req, res) => {
  try {
    const { date, title, items, price } = req.body;
    if (!date || !title || price == null)
      return res.status(400).json({ message: "date, title, price required" });

    await PersonalTiffin.create({
      userId: req.params.uid,
      date,
      title: title.trim(),
      items: toItems(items),
      price: Number(price),
      addedBy: "admin",
    });

    res.status(201).json({ message: "Added personal tiffin" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;