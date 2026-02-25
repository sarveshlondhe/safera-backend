/**
 * Run once to create the default admin user:
 *   node src/seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/tiffin_db';

async function seed() {
  try {
    await mongoose.connect(MONGO);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existing = await User.findOne({ role: 'admin' });
    if (existing) {
      console.log('⚠️  Admin already exists:', existing.email);
      process.exit(0);
    }

    // Create admin
    const passwordHash = await bcrypt.hash('admin123', 10);

    const admin = await User.create({
      name: 'Admin',
      email: 'admin@tiffin.com',
      passwordHash,
      role: 'admin',
      isActive: true,
      isApproved: true,   // ✅ IMPORTANT FIX
    });

    console.log('\n🎉 Admin user created successfully!');
    console.log('-----------------------------------');
    console.log('   Email   : admin@tiffin.com');
    console.log('   Password: admin123');
    console.log('   Login at: http://localhost:5173/admin/login');
    console.log('-----------------------------------\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error while seeding:', err.message);
    process.exit(1);
  }
}

seed();