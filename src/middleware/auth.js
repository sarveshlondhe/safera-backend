const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const h = req.headers.authorization;

    if (!h || !h.startsWith('Bearer '))
      return res.status(401).json({ message: 'No token. Please login.' });

    const token = h.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tiffin_jwt_secret_change_me');

    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    // ✅ Block deactivated users
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account deactivated. Contact admin.' });
    }

    // ✅ Block unapproved users (IMPORTANT)
    if (user.role === 'user' && !user.isApproved) {
      return res.status(403).json({ message: 'Your account is pending admin approval.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token. Please login again.' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

module.exports = { auth, adminOnly };