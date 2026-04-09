require('dotenv').config();
const express = require('express');
const { Firestore } = require('@google-cloud/firestore');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const firestore = new Firestore({ projectId: process.env.PROJECT_ID });
const JWT_SECRET = process.env.JWT_SECRET || 'bank-project-secret-key-2024';

// ROOT ROUTE
app.get('/', (req, res) => {
  res.json({
    service: 'auth-service',
    version: '1.0.0',
    status: 'running',
    project: process.env.PROJECT_ID || 'bank-project-solutions',
    endpoints: {
      health:   'GET  /health',
      register: 'POST /auth/register',
      login:    'POST /auth/login',
      verify:   'POST /auth/verify',
      profile:  'GET  /auth/profile/:userId',
    },
    timestamp: new Date().toISOString(),
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-service' });
});

// Register
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password, name required' });
    }

    // Email already exists check
    const existing = await firestore
      .collection('users')
      .where('email', '==', email)
      .get();

    if (!existing.empty) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Password hash చేయి
    const hashedPassword = await bcrypt.hash(password, 10);

    const userId = `USER-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const user = {
      user_id: userId,
      email,
      name,
      phone: phone || '',
      password: hashedPassword,
      role: 'customer',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await firestore.collection('users').doc(userId).set(user);

    // Token generate చేయి
    const token = jwt.sign(
      { user_id: userId, email, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: { user_id: userId, email, name, role: 'customer' },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email, password required' });
    }

    const snapshot = await firestore
      .collection('users')
      .where('email', '==', email)
      .get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = snapshot.docs[0].data();
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify Token
app.post('/auth/verify', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ success: false, valid: false, error: 'Invalid token' });
  }
});

// Get Profile
app.get('/auth/profile/:userId', async (req, res) => {
  try {
    const doc = await firestore.collection('users').doc(req.params.userId).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });

    const user = doc.data();
    delete user.password; // Password return చేయవద్దు
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Auth Service running on port ${PORT}`);
});