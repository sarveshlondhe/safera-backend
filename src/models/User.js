const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true, // ✅ faster login lookup
    },

    passwordHash: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isApproved: {
      type: Boolean,
      default: false, // users require admin approval
    },

    phone: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

/**
 * ✅ Automatically approve admin users
 * This prevents accidental admin lock.
 */
userSchema.pre('save', function (next) {
  if (this.role === 'admin') {
    this.isApproved = true;
    this.isActive = true;
  }
  next();
});

module.exports =
  mongoose.models.User || mongoose.model('User', userSchema);