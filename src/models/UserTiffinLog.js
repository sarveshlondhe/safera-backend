const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',        required: true },
  tiffinId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyTiffin', required: true },
  date:     { type: String, required: true },
  price:    { type: Number, required: true, default: 0 },
  status:   { type: String, enum: ['pending','delivered','skipped'], default: 'pending' },
}, { timestamps: true });

schema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.UserTiffinLog || mongoose.model('UserTiffinLog', schema);