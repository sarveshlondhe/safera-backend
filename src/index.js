const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user',  require('./routes/user'));

const PORT = process.env.PORT || 5000;
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/tiffin_db';

mongoose.connect(MONGO)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server → http://localhost:${PORT}`);
      console.log('💡 First time? Run: npm run seed');
    });
  })
  .catch(err => {
    console.error('❌ MongoDB error:', err.message);
    process.exit(1);
  });