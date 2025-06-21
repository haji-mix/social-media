const express = require('express');
const { createUserStore, createPostStore } = require('../config/database');

const router = express.Router();

// Get user profile by ID or username
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const currentUserId = req.user.id;

    const userStore = createUserStore();
    await userStore.start();

    let user;
    
    // Check if identifier is a UUID (user ID) or username
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(identifier)) {
      // It's a UUID, get by ID
      user = await userStore.get(identifier);
    } else {
      // It's a username, get by username
      const usernameLookup = await userStore.get(`username:${identifier}`);
      if (usernameLookup) {
        user = await userStore.get(usernameLookup.userId);
      }
    }

    await userStore.close();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove sensitive information
    const { password, email, ...publicProfile } = user;

    // Check if current user can see this profile
    if (user.isPrivate && user.id !== currentUserId && !user.friends.includes(currentUserId)) {
      return res.status(403).json({ error: 'Profile is private' });
    }

    res.json({ user: publicProfile });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      displayName,
      bio,
      location,
      website,
      birthDate,
      gender,
      phone,
      isPrivate
    } = req.body;

    const userStore = createUserStore();
    await userStore.start();

    const user = await userStore.get(userId);
    if (!user) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Update profile fields
    if (displayName !== undefined) user.profile.displayName = displayName;
    if (bio !== undefined) user.profile.bio = bio;
    if (location !== undefined) user.profile.location = location;
    if (website !== undefined) user.profile.website = website;
    if (birthDate !== undefined) user.profile.birthDate = birthDate;
    if (gender !== undefined) user.profile.gender = gender;
    if (phone !== undefined) user.profile.phone = phone;
    if (isPrivate !== undefined) user.isPrivate = isPrivate;

    user.updatedAt = new Date().toISOString();

    await userStore.put(userId, user);
    await userStore.close();

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    res.json({
      message: 'Profile updated successfully',
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Upload avatar
router.put('/avatar', async (req, res) => {
  try {
    const userId = req.user.id;
    const { avatar } = req.body; // Base64 encoded image

    if (!avatar) {
      return res.status(400).json({ error: 'Avatar data is required' });
    }

    const userStore = createUserStore();
    await userStore.start();

    const user = await userStore.get(userId);
    if (!user) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    user.profile.avatar = avatar;
    user.updatedAt = new Date().toISOString();

    await userStore.put(userId, user);
    await userStore.close();

    res.json({
      message: 'Avatar updated successfully',
      avatar
    });

  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Upload cover photo
router.put('/cover-photo', async (req, res) => {
  try {
    const userId = req.user.id;
    const { coverPhoto } = req.body; // Base64 encoded image

    if (!coverPhoto) {
      return res.status(400).json({ error: 'Cover photo data is required' });
    }

    const userStore = createUserStore();
    await userStore.start();

    const user = await userStore.get(userId);
    if (!user) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    user.profile.coverPhoto = coverPhoto;
    user.updatedAt = new Date().toISOString();

    await userStore.put(userId, user);
    await userStore.close();

    res.json({
      message: 'Cover photo updated successfully',
      coverPhoto
    });

  } catch (error) {
    console.error('Upload cover photo error:', error);
    res.status(500).json({ error: 'Failed to upload cover photo' });
  }
});

// Search users
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const currentUserId = req.user.id;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const userStore = createUserStore();
    await userStore.start();

    // Get all users and filter
    const allUsers = await userStore.load();
    const users = [];

    for (const [key, user] of Object.entries(allUsers)) {
      // Skip lookup keys and non-user objects
      if (key.startsWith('email:') || key.startsWith('username:') || !user.id) {
        continue;
      }

      // Skip current user
      if (user.id === currentUserId) {
        continue;
      }

      // Check if user matches search query
      const searchLower = query.toLowerCase();
      const matchesName = user.profile.displayName.toLowerCase().includes(searchLower);
      const matchesUsername = user.username.toLowerCase().includes(searchLower);
      const matchesFirstName = user.firstName.toLowerCase().includes(searchLower);
      const matchesLastName = user.lastName.toLowerCase().includes(searchLower);

      if (matchesName || matchesUsername || matchesFirstName || matchesLastName) {
        // Remove sensitive information
        const { password, email, ...publicProfile } = user;
        users.push(publicProfile);
      }
    }

    await userStore.close();

    // Apply pagination
    const paginatedUsers = users.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      users: paginatedUsers,
      total: users.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user's posts
router.get('/:userId/posts', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const currentUserId = req.user.id;

    const userStore = createUserStore();
    const postStore = createPostStore();
    
    await userStore.start();
    await postStore.start();

    // Check if user exists and is accessible
    const user = await userStore.get(userId);
    if (!user) {
      await userStore.close();
      await postStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isPrivate && user.id !== currentUserId && !user.friends.includes(currentUserId)) {
      await userStore.close();
      await postStore.close();
      return res.status(403).json({ error: 'Profile is private' });
    }

    // Get all posts and filter by user
    const allPosts = await postStore.load();
    const userPosts = [];

    for (const [key, post] of Object.entries(allPosts)) {
      if (post.userId === userId && post.isDeleted !== true) {
        userPosts.push(post);
      }
    }

    // Sort by creation date (newest first)
    userPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    await userStore.close();
    await postStore.close();

    // Apply pagination
    const paginatedPosts = userPosts.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      posts: paginatedPosts,
      total: userPosts.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Failed to get user posts' });
  }
});

// Get user's friends
router.get('/:userId/friends', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const currentUserId = req.user.id;

    const userStore = createUserStore();
    await userStore.start();

    const user = await userStore.get(userId);
    if (!user) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isPrivate && user.id !== currentUserId && !user.friends.includes(currentUserId)) {
      await userStore.close();
      return res.status(403).json({ error: 'Profile is private' });
    }

    // Get friend details
    const friends = [];
    for (const friendId of user.friends) {
      const friend = await userStore.get(friendId);
      if (friend) {
        const { password, email, ...publicProfile } = friend;
        friends.push(publicProfile);
      }
    }

    await userStore.close();

    // Apply pagination
    const paginatedFriends = friends.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      friends: paginatedFriends,
      total: friends.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get user friends error:', error);
    res.status(500).json({ error: 'Failed to get user friends' });
  }
});

// Delete user account
router.delete('/account', async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    const userStore = createUserStore();
    await userStore.start();

    const user = await userStore.get(userId);
    if (!user) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await userStore.close();
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Delete user data
    await userStore.remove(userId);
    await userStore.remove(`email:${user.email}`);
    await userStore.remove(`username:${user.username}`);

    await userStore.close();

    res.json({ message: 'Account deleted successfully' });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router; 