const express = require('express');
const { createUserStore, createNotificationStore } = require('../config/database');

const router = express.Router();

// Send friend request
router.post('/request/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (userId === currentUserId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
    }

    const userStore = createUserStore();
    const notificationStore = createNotificationStore();
    
    await userStore.start();
    await notificationStore.start();

    const currentUser = await userStore.get(currentUserId);
    const targetUser = await userStore.get(userId);

    if (!currentUser || !targetUser) {
      await userStore.close();
      await notificationStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already friends
    if (currentUser.friends.includes(userId)) {
      await userStore.close();
      await notificationStore.close();
      return res.status(400).json({ error: 'You are already friends with this user' });
    }

    // Check if request already sent
    if (currentUser.pendingRequests.includes(userId)) {
      await userStore.close();
      await notificationStore.close();
      return res.status(400).json({ error: 'Friend request already sent' });
    }

    // Check if request already received
    if (currentUser.friendRequests.includes(userId)) {
      await userStore.close();
      await notificationStore.close();
      return res.status(400).json({ error: 'This user has already sent you a friend request' });
    }

    // Add to pending requests for current user
    currentUser.pendingRequests.push(userId);
    currentUser.updatedAt = new Date().toISOString();

    // Add to friend requests for target user
    targetUser.friendRequests.push(currentUserId);
    targetUser.updatedAt = new Date().toISOString();

    await userStore.put(currentUserId, currentUser);
    await userStore.put(userId, targetUser);

    // Create notification
    const notificationId = `${currentUserId}_${userId}_friend_request`;
    const notification = {
      id: notificationId,
      userId,
      type: 'friend_request',
      fromUserId: currentUserId,
      fromUsername: currentUser.username,
      fromDisplayName: currentUser.profile.displayName,
      message: `${currentUser.profile.displayName} sent you a friend request`,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    await notificationStore.put(notificationId, notification);

    await userStore.close();
    await notificationStore.close();

    res.json({
      message: 'Friend request sent successfully',
      targetUser: {
        id: targetUser.id,
        username: targetUser.username,
        profile: targetUser.profile
      }
    });

  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
router.post('/accept/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const userStore = createUserStore();
    const notificationStore = createNotificationStore();
    
    await userStore.start();
    await notificationStore.start();

    const currentUser = await userStore.get(currentUserId);
    const requestingUser = await userStore.get(userId);

    if (!currentUser || !requestingUser) {
      await userStore.close();
      await notificationStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if request exists
    if (!currentUser.friendRequests.includes(userId)) {
      await userStore.close();
      await notificationStore.close();
      return res.status(400).json({ error: 'No friend request from this user' });
    }

    // Remove from friend requests
    const requestIndex = currentUser.friendRequests.indexOf(userId);
    currentUser.friendRequests.splice(requestIndex, 1);

    // Add to friends
    currentUser.friends.push(userId);
    currentUser.updatedAt = new Date().toISOString();

    // Remove from pending requests for requesting user
    const pendingIndex = requestingUser.pendingRequests.indexOf(currentUserId);
    if (pendingIndex > -1) {
      requestingUser.pendingRequests.splice(pendingIndex, 1);
    }

    // Add to friends for requesting user
    requestingUser.friends.push(currentUserId);
    requestingUser.updatedAt = new Date().toISOString();

    await userStore.put(currentUserId, currentUser);
    await userStore.put(userId, requestingUser);

    // Create notification for requesting user
    const notificationId = `${currentUserId}_${userId}_friend_accepted`;
    const notification = {
      id: notificationId,
      userId,
      type: 'friend_accepted',
      fromUserId: currentUserId,
      fromUsername: currentUser.username,
      fromDisplayName: currentUser.profile.displayName,
      message: `${currentUser.profile.displayName} accepted your friend request`,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    await notificationStore.put(notificationId, notification);

    await userStore.close();
    await notificationStore.close();

    res.json({
      message: 'Friend request accepted successfully',
      newFriend: {
        id: requestingUser.id,
        username: requestingUser.username,
        profile: requestingUser.profile
      }
    });

  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Reject friend request
router.post('/reject/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const userStore = createUserStore();
    await userStore.start();

    const currentUser = await userStore.get(currentUserId);
    const requestingUser = await userStore.get(userId);

    if (!currentUser || !requestingUser) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if request exists
    if (!currentUser.friendRequests.includes(userId)) {
      await userStore.close();
      return res.status(400).json({ error: 'No friend request from this user' });
    }

    // Remove from friend requests
    const requestIndex = currentUser.friendRequests.indexOf(userId);
    currentUser.friendRequests.splice(requestIndex, 1);
    currentUser.updatedAt = new Date().toISOString();

    // Remove from pending requests for requesting user
    const pendingIndex = requestingUser.pendingRequests.indexOf(currentUserId);
    if (pendingIndex > -1) {
      requestingUser.pendingRequests.splice(pendingIndex, 1);
      requestingUser.updatedAt = new Date().toISOString();
    }

    await userStore.put(currentUserId, currentUser);
    await userStore.put(userId, requestingUser);
    await userStore.close();

    res.json({ message: 'Friend request rejected successfully' });

  } catch (error) {
    console.error('Reject friend request error:', error);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// Cancel friend request
router.post('/cancel/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const userStore = createUserStore();
    await userStore.start();

    const currentUser = await userStore.get(currentUserId);
    const targetUser = await userStore.get(userId);

    if (!currentUser || !targetUser) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if request was sent
    if (!currentUser.pendingRequests.includes(userId)) {
      await userStore.close();
      return res.status(400).json({ error: 'No pending friend request to this user' });
    }

    // Remove from pending requests for current user
    const pendingIndex = currentUser.pendingRequests.indexOf(userId);
    currentUser.pendingRequests.splice(pendingIndex, 1);
    currentUser.updatedAt = new Date().toISOString();

    // Remove from friend requests for target user
    const requestIndex = targetUser.friendRequests.indexOf(currentUserId);
    if (requestIndex > -1) {
      targetUser.friendRequests.splice(requestIndex, 1);
      targetUser.updatedAt = new Date().toISOString();
    }

    await userStore.put(currentUserId, currentUser);
    await userStore.put(userId, targetUser);
    await userStore.close();

    res.json({ message: 'Friend request cancelled successfully' });

  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ error: 'Failed to cancel friend request' });
  }
});

// Remove friend
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (userId === currentUserId) {
      return res.status(400).json({ error: 'You cannot remove yourself as a friend' });
    }

    const userStore = createUserStore();
    await userStore.start();

    const currentUser = await userStore.get(currentUserId);
    const friendUser = await userStore.get(userId);

    if (!currentUser || !friendUser) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if they are friends
    if (!currentUser.friends.includes(userId)) {
      await userStore.close();
      return res.status(400).json({ error: 'You are not friends with this user' });
    }

    // Remove from friends for current user
    const friendIndex = currentUser.friends.indexOf(userId);
    currentUser.friends.splice(friendIndex, 1);
    currentUser.updatedAt = new Date().toISOString();

    // Remove from friends for friend user
    const currentUserIndex = friendUser.friends.indexOf(currentUserId);
    if (currentUserIndex > -1) {
      friendUser.friends.splice(currentUserIndex, 1);
      friendUser.updatedAt = new Date().toISOString();
    }

    await userStore.put(currentUserId, currentUser);
    await userStore.put(userId, friendUser);
    await userStore.close();

    res.json({ message: 'Friend removed successfully' });

  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Get friend requests
router.get('/requests', async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const userStore = createUserStore();
    await userStore.start();

    const currentUser = await userStore.get(currentUserId);
    if (!currentUser) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Get friend request details
    const requests = [];
    for (const requestUserId of currentUser.friendRequests) {
      const requestUser = await userStore.get(requestUserId);
      if (requestUser) {
        const { password, email, ...publicProfile } = requestUser;
        requests.push(publicProfile);
      }
    }

    await userStore.close();

    // Apply pagination
    const paginatedRequests = requests.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      requests: paginatedRequests,
      total: requests.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
});

// Get pending friend requests
router.get('/pending', async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const userStore = createUserStore();
    await userStore.start();

    const currentUser = await userStore.get(currentUserId);
    if (!currentUser) {
      await userStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Get pending request details
    const pending = [];
    for (const pendingUserId of currentUser.pendingRequests) {
      const pendingUser = await userStore.get(pendingUserId);
      if (pendingUser) {
        const { password, email, ...publicProfile } = pendingUser;
        pending.push(publicProfile);
      }
    }

    await userStore.close();

    // Apply pagination
    const paginatedPending = pending.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      pending: paginatedPending,
      total: pending.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ error: 'Failed to get pending requests' });
  }
});

module.exports = router; 