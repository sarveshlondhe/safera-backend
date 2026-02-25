const mongoose = require('mongoose');

// Personal tiffins are user-added entries (extra tiffin/snacks/etc.)
// Stored separately from admin DailyTiffin and the per-day UserTiffinLog.
const schema = new mongoose.Schema(
  {
    userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date:    { type: String, required: true }, // YYYY-MM-DD
    title:   { type: String, required: true, trim: true },
    items:   [{ type: String, trim: true }],
    price:   { type: Number, required: true, min: 0 },
    addedBy: { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);

// Allow multiple personal entries per day for a user.
schema.index({ userId: 1, date: 1 });

module.exports = mongoose.models.PersonalTiffin || mongoose.model('PersonalTiffin', schema);