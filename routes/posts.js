const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createPostStore, createUserStore, createCommentStore } = require('../config/database');

const router = express.Router();

// Create a new post
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, images, privacy = 'public', location } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const userStore = createUserStore();
    const postStore = createPostStore();
    
    await userStore.start();
    await postStore.start();

    // Verify user exists
    const user = await userStore.get(userId);
    if (!user) {
      await userStore.close();
      await postStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Create post object
    const postId = uuidv4();
    const post = {
      id: postId,
      userId,
      content: content.trim(),
      images: images || [],
      privacy, // public, friends, private
      location,
      likes: [],
      comments: [],
      shares: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false
    };

    await postStore.put(postId, post);
    await userStore.close();
    await postStore.close();

    // Add user info to response
    const postWithUser = {
      ...post,
      user: {
        id: user.id,
        username: user.username,
        profile: user.profile
      }
    };

    res.status(201).json({
      message: 'Post created successfully',
      post: postWithUser
    });

  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Get feed posts (posts from friends and public posts)
router.get('/feed', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    const userStore = createUserStore();
    const postStore = createPostStore();
    
    await userStore.start();
    await postStore.start();

    // Get current user's friends
    const currentUser = await userStore.get(userId);
    if (!currentUser) {
      await userStore.close();
      await postStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    const friends = currentUser.friends || [];
    const allowedUsers = [userId, ...friends];

    // Get all posts
    const allPosts = await postStore.load();
    const feedPosts = [];

    for (const [key, post] of Object.entries(allPosts)) {
      if (post.isDeleted === true) continue;

      // Check if post is accessible to current user
      const isOwnPost = post.userId === userId;
      const isFriendPost = friends.includes(post.userId);
      const isPublicPost = post.privacy === 'public';
      const isFriendsPost = post.privacy === 'friends' && isFriendPost;

      if (isOwnPost || isPublicPost || isFriendsPost) {
        // Get user info for the post
        const postUser = await userStore.get(post.userId);
        if (postUser) {
          const postWithUser = {
            ...post,
            user: {
              id: postUser.id,
              username: postUser.username,
              profile: postUser.profile
            }
          };
          feedPosts.push(postWithUser);
        }
      }
    }

    await userStore.close();
    await postStore.close();

    // Sort by creation date (newest first)
    feedPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const paginatedPosts = feedPosts.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      posts: paginatedPosts,
      total: feedPosts.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Get a specific post
router.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const currentUserId = req.user.id;

    const postStore = createPostStore();
    const userStore = createUserStore();
    
    await postStore.start();
    await userStore.start();

    const post = await postStore.get(postId);
    if (!post || post.isDeleted === true) {
      await postStore.close();
      await userStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user can access this post
    const postUser = await userStore.get(post.userId);
    if (!postUser) {
      await postStore.close();
      await userStore.close();
      return res.status(404).json({ error: 'Post author not found' });
    }

    const currentUser = await userStore.get(currentUserId);
    const isOwnPost = post.userId === currentUserId;
    const isFriend = currentUser.friends.includes(post.userId);
    const isPublicPost = post.privacy === 'public';
    const isFriendsPost = post.privacy === 'friends' && isFriend;

    if (!isOwnPost && !isPublicPost && !isFriendsPost) {
      await postStore.close();
      await userStore.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Add user info to post
    const postWithUser = {
      ...post,
      user: {
        id: postUser.id,
        username: postUser.username,
        profile: postUser.profile
      }
    };

    await postStore.close();
    await userStore.close();

    res.json({ post: postWithUser });

  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// Update a post
router.put('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { content, images, privacy, location } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const postStore = createPostStore();
    await postStore.start();

    const post = await postStore.get(postId);
    if (!post || post.isDeleted === true) {
      await postStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user owns the post
    if (post.userId !== userId) {
      await postStore.close();
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    // Update post
    post.content = content.trim();
    if (images !== undefined) post.images = images;
    if (privacy !== undefined) post.privacy = privacy;
    if (location !== undefined) post.location = location;
    post.updatedAt = new Date().toISOString();

    await postStore.put(postId, post);
    await postStore.close();

    res.json({
      message: 'Post updated successfully',
      post
    });

  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete a post
router.delete('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const postStore = createPostStore();
    await postStore.start();

    const post = await postStore.get(postId);
    if (!post || post.isDeleted === true) {
      await postStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user owns the post
    if (post.userId !== userId) {
      await postStore.close();
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    // Soft delete the post
    post.isDeleted = true;
    post.updatedAt = new Date().toISOString();

    await postStore.put(postId, post);
    await postStore.close();

    res.json({ message: 'Post deleted successfully' });

  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Like/unlike a post
router.post('/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const postStore = createPostStore();
    await postStore.start();

    const post = await postStore.get(postId);
    if (!post || post.isDeleted === true) {
      await postStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
    } else {
      // Like
      post.likes.push(userId);
    }

    post.updatedAt = new Date().toISOString();

    await postStore.put(postId, post);
    await postStore.close();

    res.json({
      message: likeIndex > -1 ? 'Post unliked' : 'Post liked',
      likes: post.likes,
      isLiked: likeIndex === -1
    });

  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like/unlike post' });
  }
});

// Get post likes
router.get('/:postId/likes', async (req, res) => {
  try {
    const { postId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const postStore = createPostStore();
    const userStore = createUserStore();
    
    await postStore.start();
    await userStore.start();

    const post = await postStore.get(postId);
    if (!post || post.isDeleted === true) {
      await postStore.close();
      await userStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    // Get user details for likes
    const likes = [];
    for (const likeUserId of post.likes) {
      const user = await userStore.get(likeUserId);
      if (user) {
        const { password, email, ...publicProfile } = user;
        likes.push(publicProfile);
      }
    }

    await postStore.close();
    await userStore.close();

    // Apply pagination
    const paginatedLikes = likes.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      likes: paginatedLikes,
      total: likes.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get post likes error:', error);
    res.status(500).json({ error: 'Failed to get post likes' });
  }
});

// Share a post
router.post('/:postId/share', async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { content, privacy = 'public' } = req.body;

    const postStore = createPostStore();
    await postStore.start();

    const originalPost = await postStore.get(postId);
    if (!originalPost || originalPost.isDeleted === true) {
      await postStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    // Create new post that shares the original
    const shareId = uuidv4();
    const sharePost = {
      id: shareId,
      userId,
      content: content || '',
      images: [],
      privacy,
      location: null,
      likes: [],
      comments: [],
      shares: [],
      sharedPost: {
        id: originalPost.id,
        userId: originalPost.userId,
        content: originalPost.content,
        images: originalPost.images
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false
    };

    await postStore.put(shareId, sharePost);
    
    // Add to original post's shares
    originalPost.shares.push(userId);
    originalPost.updatedAt = new Date().toISOString();
    await postStore.put(postId, originalPost);

    await postStore.close();

    res.status(201).json({
      message: 'Post shared successfully',
      share: sharePost
    });

  } catch (error) {
    console.error('Share post error:', error);
    res.status(500).json({ error: 'Failed to share post' });
  }
});

module.exports = router; 