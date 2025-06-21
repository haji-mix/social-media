const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { createUserStore } = require('../config/database');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, username, firstName, lastName } = req.body;

    // Validation
    if (!email || !password || !username || !firstName || !lastName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    const userStore = createUserStore();
    await userStore.start();

    // Check if user already exists
    const existingUserByEmail = await userStore.get(`email:${email}`);
    if (existingUserByEmail) {
      await userStore.close();
      return res.status(400).json({ error: 'Email already registered' });
    }

    const existingUserByUsername = await userStore.get(`username:${username}`);
    if (existingUserByUsername) {
      await userStore.close();
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user object
    const userId = uuidv4();
    const user = {
      id: userId,
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName,
      profile: {
        displayName: `${firstName} ${lastName}`,
        bio: '',
        avatar: '',
        coverPhoto: '',
        location: '',
        website: '',
        birthDate: null,
        gender: '',
        phone: ''
      },
      friends: [],
      friendRequests: [],
      pendingRequests: [],
      followers: [],
      following: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isVerified: false,
      isPrivate: false,
      lastActive: new Date().toISOString()
    };

    // Store user data
    await userStore.put(userId, user);
    await userStore.put(`email:${email}`, { userId });
    await userStore.put(`username:${username}`, { userId });

    await userStore.close();

    // Generate token
    const token = generateToken(userId);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      message: 'User registered successfully',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userStore = createUserStore();
    await userStore.start();

    // Find user by email
    const emailLookup = await userStore.get(`email:${email}`);
    if (!emailLookup) {
      await userStore.close();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = await userStore.get(emailLookup.userId);
    await userStore.close();

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last active
    user.lastActive = new Date().toISOString();
    userStore.put(user.id, user);

    // Generate token
    const token = generateToken(user.id);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const userStore = createUserStore();
    await userStore.start();
    
    const user = await userStore.get(decoded.userId);
    await userStore.close();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Change password
router.put('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const userStore = createUserStore();
    await userStore.start();
    
    const user = await userStore.get(decoded.userId);
    if (!user) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      await userStore.close();
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.password = hashedPassword;
    user.updatedAt = new Date().toISOString();

    await userStore.put(user.id, user);
    await userStore.close();

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Forgot password (send reset email)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const userStore = createUserStore();
    await userStore.start();

    const emailLookup = await userStore.get(`email:${email}`);
    await userStore.close();

    if (!emailLookup) {
      // Don't reveal if email exists or not
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }

    // In a real application, you would send an email here
    // For now, we'll just return a success message
    res.json({ message: 'If the email exists, a reset link has been sent' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

module.exports = router; 