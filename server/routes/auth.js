const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'argus_super_secure_jwt_secret_key_2026';

// Demo compliance officer user
const DEMO_OFFICER = {
  id: 'usr_officer_842',
  name: 'Sarah Chen, CAMS',
  email: 'officer@argus.aml',
  role: 'compliance_officer',
  badgeId: 'CAMS-84209',
  jurisdiction: 'Financial Crimes Enforcement Network (FinCEN) / FIU'
};

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Check demo credentials or accept standard compliance password
  if (email === 'officer@argus.aml' && (password === 'argus2026' || password === 'demo' || password.length >= 4)) {
    const token = jwt.sign(DEMO_OFFICER, JWT_SECRET, { expiresIn: '24h' });
    return res.json({
      token,
      user: DEMO_OFFICER
    });
  }

  // Fallback demo acceptance for any officer email with password
  if (email && password) {
    const user = {
      ...DEMO_OFFICER,
      email: email,
      name: email.split('@')[0].replace('.', ' ').toUpperCase()
    };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, user });
  }

  return res.status(401).json({ error: 'Invalid credentials. Use demo login or officer@argus.aml / argus2026' });
});

// POST /api/auth/demo-login - 1-Click login for reviewers/auditors
router.post('/demo-login', (req, res) => {
  const token = jwt.sign(DEMO_OFFICER, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    user: DEMO_OFFICER
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  const token = authHeader.replace(/^Bearer\s+/, '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired session token' });
  }
});

module.exports = router;
