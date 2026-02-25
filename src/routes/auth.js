const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');
const { auth } = require('../middleware/auth');
const router  = express.Router();

const sign = id => jwt.sign({ id }, process.env.JWT_SECRET || 'tiffin_jwt_secret_change_me', { expiresIn: '7d' });

// USER REGISTER → isApproved:false, admin must approve
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ message: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({
      name: name.trim(), email: email.toLowerCase(),
      passwordHash, phone: phone || '',
      role: 'user', isApproved: false, isActive: true,
    });
    res.status(201).json({ message: 'Registration successful! Please wait for admin approval before logging in.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADMIN REGISTER
router.post('/admin-register', async (req, res) => {
  try {
    const { name, email, password, adminSecret } = req.body;
    if (adminSecret !== (process.env.ADMIN_SECRET || 'TIFFIN_ADMIN_2024'))
      return res.status(403).json({ message: 'Wrong admin secret key.' });
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields required.' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(400).json({ message: 'Email already registered.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await User.create({
      name: name.trim(), email: email.toLowerCase(),
      passwordHash, role: 'admin', isApproved: true, isActive: true,
    });
    res.status(201).json({ token: sign(admin._id), user: { id: admin._id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(400).json({ message: 'Invalid email or password.' });
    if (!user.isActive)
      return res.status(403).json({ message: 'Account deactivated. Contact admin.' });
    if (user.role === 'user' && !user.isApproved)
      return res.status(403).json({ message: 'Your account is pending admin approval. Please wait.' });
    if (!(await bcrypt.compare(password, user.passwordHash)))
      return res.status(400).json({ message: 'Invalid email or password.' });

    res.json({ token: sign(user._id), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CHANGE PASSWORD
router.post('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Both fields required.' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    const user = await User.findById(req.user._id);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
      return res.status(400).json({ message: 'Current password is incorrect.' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password changed successfully.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE PROFILE
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findById(req.user._id);
    if (name)  user.name  = name.trim();
    if (phone !== undefined) user.phone = phone;
    await user.save();
    res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;