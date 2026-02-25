const mongoose = require('mongoose');

const dailyTiffinSchema = new mongoose.Schema({
  date:      { type: String, required: true, unique: true },
  title:     { type: String, required: true },
  items:     [{ type: String }],
  price:     { type: Number, required: true, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.models.DailyTiffin || mongoose.model('DailyTiffin', dailyTiffinSchema);