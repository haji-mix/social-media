const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createMessageStore, createUserStore } = require('../config/database');

const router = express.Router();

// Send a message
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const { content, type = 'text' } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ error: 'You cannot send a message to yourself' });
    }

    const userStore = createUserStore();
    const messageStore = createMessageStore();
    
    await userStore.start();
    await messageStore.start();

    const currentUser = await userStore.get(currentUserId);
    const targetUser = await userStore.get(userId);

    if (!currentUser || !targetUser) {
      await userStore.close();
      await messageStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if users are friends (for privacy)
    if (!currentUser.friends.includes(userId)) {
      await userStore.close();
      await messageStore.close();
      return res.status(403).json({ error: 'You can only send messages to friends' });
    }

    // Create message
    const messageId = uuidv4();
    const message = {
      id: messageId,
      senderId: currentUserId,
      receiverId: userId,
      content: content.trim(),
      type, // text, image, file, etc.
      isRead: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await messageStore.put(messageId, message);

    await userStore.close();
    await messageStore.close();

    // Add user info to response
    const messageWithUser = {
      ...message,
      sender: {
        id: currentUser.id,
        username: currentUser.username,
        profile: currentUser.profile
      }
    };

    res.status(201).json({
      message: 'Message sent successfully',
      message: messageWithUser
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get conversation with a user
router.get('/conversation/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    if (userId === currentUserId) {
      return res.status(400).json({ error: 'Cannot get conversation with yourself' });
    }

    const userStore = createUserStore();
    const messageStore = createMessageStore();
    
    await userStore.start();
    await messageStore.start();

    const currentUser = await userStore.get(currentUserId);
    const targetUser = await userStore.get(userId);

    if (!currentUser || !targetUser) {
      await userStore.close();
      await messageStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if users are friends
    if (!currentUser.friends.includes(userId)) {
      await userStore.close();
      await messageStore.close();
      return res.status(403).json({ error: 'You can only view conversations with friends' });
    }

    // Get all messages between the two users
    const allMessages = await messageStore.load();
    const conversation = [];

    for (const [key, message] of Object.entries(allMessages)) {
      if ((message.senderId === currentUserId && message.receiverId === userId) ||
          (message.senderId === userId && message.receiverId === currentUserId)) {
        conversation.push(message);
      }
    }

    // Sort by creation date (oldest first for conversation view)
    conversation.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Mark messages as read
    for (const message of conversation) {
      if (message.receiverId === currentUserId && !message.isRead) {
        message.isRead = true;
        message.updatedAt = new Date().toISOString();
        await messageStore.put(message.id, message);
      }
    }

    await userStore.close();
    await messageStore.close();

    // Apply pagination
    const paginatedMessages = conversation.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // Add user info to messages
    const messagesWithUsers = paginatedMessages.map(message => {
      const sender = message.senderId === currentUserId ? currentUser : targetUser;
      return {
        ...message,
        sender: {
          id: sender.id,
          username: sender.username,
          profile: sender.profile
        }
      };
    });

    res.json({
      messages: messagesWithUsers,
      total: conversation.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Get all conversations for current user
router.get('/conversations', async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const userStore = createUserStore();
    const messageStore = createMessageStore();
    
    await userStore.start();
    await messageStore.start();

    const currentUser = await userStore.get(currentUserId);
    if (!currentUser) {
      await userStore.close();
      await messageStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all messages involving current user
    const allMessages = await messageStore.load();
    const conversations = new Map(); // userId -> last message

    for (const [key, message] of Object.entries(allMessages)) {
      if (message.senderId === currentUserId || message.receiverId === currentUserId) {
        const otherUserId = message.senderId === currentUserId ? message.receiverId : message.senderId;
        
        if (!conversations.has(otherUserId) || 
            new Date(message.createdAt) > new Date(conversations.get(otherUserId).createdAt)) {
          conversations.set(otherUserId, message);
        }
      }
    }

    // Convert to array and sort by last message date
    const conversationList = Array.from(conversations.entries()).map(([userId, message]) => ({
      userId,
      lastMessage: message
    }));

    conversationList.sort((a, b) => 
      new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt)
    );

    await userStore.close();
    await messageStore.close();

    // Apply pagination
    const paginatedConversations = conversationList.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    // Add user info to conversations
    const conversationsWithUsers = [];
    for (const conv of paginatedConversations) {
      const otherUser = await userStore.get(conv.userId);
      if (otherUser) {
        const { password, email, ...publicProfile } = otherUser;
        conversationsWithUsers.push({
          ...conv,
          user: publicProfile
        });
      }
    }

    res.json({
      conversations: conversationsWithUsers,
      total: conversationList.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

// Mark message as read
router.put('/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user.id;

    const messageStore = createMessageStore();
    await messageStore.start();

    const message = await messageStore.get(messageId);
    if (!message) {
      await messageStore.close();
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if current user is the receiver
    if (message.receiverId !== currentUserId) {
      await messageStore.close();
      return res.status(403).json({ error: 'You can only mark messages sent to you as read' });
    }

    message.isRead = true;
    message.updatedAt = new Date().toISOString();

    await messageStore.put(messageId, message);
    await messageStore.close();

    res.json({
      message: 'Message marked as read',
      message: message
    });

  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Delete a message
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user.id;

    const messageStore = createMessageStore();
    await messageStore.start();

    const message = await messageStore.get(messageId);
    if (!message) {
      await messageStore.close();
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if current user is the sender
    if (message.senderId !== currentUserId) {
      await messageStore.close();
      return res.status(403).json({ error: 'You can only delete messages you sent' });
    }

    await messageStore.remove(messageId);
    await messageStore.close();

    res.json({ message: 'Message deleted successfully' });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Get unread message count
router.get('/unread/count', async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const messageStore = createMessageStore();
    await messageStore.start();

    const allMessages = await messageStore.load();
    let unreadCount = 0;

    for (const [key, message] of Object.entries(allMessages)) {
      if (message.receiverId === currentUserId && !message.isRead) {
        unreadCount++;
      }
    }

    await messageStore.close();

    res.json({ unreadCount });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

module.exports = router; 