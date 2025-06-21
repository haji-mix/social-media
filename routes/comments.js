const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createCommentStore, createUserStore, createPostStore } = require('../config/database');

const router = express.Router();

// Add a comment to a post
router.post('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const userStore = createUserStore();
    const postStore = createPostStore();
    const commentStore = createCommentStore();
    
    await userStore.start();
    await postStore.start();
    await commentStore.start();

    // Verify post exists and user can access it
    const post = await postStore.get(postId);
    if (!post || post.isDeleted === true) {
      await userStore.close();
      await postStore.close();
      await commentStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    const currentUser = await userStore.get(userId);
    const postUser = await userStore.get(post.userId);
    
    if (!currentUser || !postUser) {
      await userStore.close();
      await postStore.close();
      await commentStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user can access this post
    const isOwnPost = post.userId === userId;
    const isFriend = currentUser.friends.includes(post.userId);
    const isPublicPost = post.privacy === 'public';
    const isFriendsPost = post.privacy === 'friends' && isFriend;

    if (!isOwnPost && !isPublicPost && !isFriendsPost) {
      await userStore.close();
      await postStore.close();
      await commentStore.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create comment
    const commentId = uuidv4();
    const comment = {
      id: commentId,
      postId,
      userId,
      content: content.trim(),
      likes: [],
      replies: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false
    };

    await commentStore.put(commentId, comment);

    // Add comment to post
    post.comments.push(commentId);
    post.updatedAt = new Date().toISOString();
    await postStore.put(postId, post);

    await userStore.close();
    await postStore.close();
    await commentStore.close();

    // Add user info to response
    const commentWithUser = {
      ...comment,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        profile: currentUser.profile
      }
    };

    res.status(201).json({
      message: 'Comment added successfully',
      comment: commentWithUser
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get comments for a post
router.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const currentUserId = req.user.id;

    const userStore = createUserStore();
    const postStore = createPostStore();
    const commentStore = createCommentStore();
    
    await userStore.start();
    await postStore.start();
    await commentStore.start();

    // Verify post exists and user can access it
    const post = await postStore.get(postId);
    if (!post || post.isDeleted === true) {
      await userStore.close();
      await postStore.close();
      await commentStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    const currentUser = await userStore.get(currentUserId);
    const postUser = await userStore.get(post.userId);
    
    if (!currentUser || !postUser) {
      await userStore.close();
      await postStore.close();
      await commentStore.close();
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user can access this post
    const isOwnPost = post.userId === currentUserId;
    const isFriend = currentUser.friends.includes(post.userId);
    const isPublicPost = post.privacy === 'public';
    const isFriendsPost = post.privacy === 'friends' && isFriend;

    if (!isOwnPost && !isPublicPost && !isFriendsPost) {
      await userStore.close();
      await postStore.close();
      await commentStore.close();
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get comments
    const comments = [];
    for (const commentId of post.comments) {
      const comment = await commentStore.get(commentId);
      if (comment && !comment.isDeleted) {
        const commentUser = await userStore.get(comment.userId);
        if (commentUser) {
          const commentWithUser = {
            ...comment,
            user: {
              id: commentUser.id,
              username: commentUser.username,
              profile: commentUser.profile
            }
          };
          comments.push(commentWithUser);
        }
      }
    }

    await userStore.close();
    await postStore.close();
    await commentStore.close();

    // Sort by creation date (newest first)
    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const paginatedComments = comments.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      comments: paginatedComments,
      total: comments.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// Update a comment
router.put('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const commentStore = createCommentStore();
    await commentStore.start();

    const comment = await commentStore.get(commentId);
    if (!comment || comment.isDeleted === true) {
      await commentStore.close();
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment
    if (comment.userId !== userId) {
      await commentStore.close();
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    // Update comment
    comment.content = content.trim();
    comment.updatedAt = new Date().toISOString();

    await commentStore.put(commentId, comment);
    await commentStore.close();

    res.json({
      message: 'Comment updated successfully',
      comment
    });

  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Delete a comment
router.delete('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const commentStore = createCommentStore();
    const postStore = createPostStore();
    
    await commentStore.start();
    await postStore.start();

    const comment = await commentStore.get(commentId);
    if (!comment || comment.isDeleted === true) {
      await commentStore.close();
      await postStore.close();
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment or the post
    const post = await postStore.get(comment.postId);
    if (!post) {
      await commentStore.close();
      await postStore.close();
      return res.status(404).json({ error: 'Post not found' });
    }

    if (comment.userId !== userId && post.userId !== userId) {
      await commentStore.close();
      await postStore.close();
      return res.status(403).json({ error: 'You can only delete your own comments or comments on your posts' });
    }

    // Soft delete the comment
    comment.isDeleted = true;
    comment.updatedAt = new Date().toISOString();

    await commentStore.put(commentId, comment);

    // Remove comment from post
    const commentIndex = post.comments.indexOf(commentId);
    if (commentIndex > -1) {
      post.comments.splice(commentIndex, 1);
      post.updatedAt = new Date().toISOString();
      await postStore.put(comment.postId, post);
    }

    await commentStore.close();
    await postStore.close();

    res.json({ message: 'Comment deleted successfully' });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Like/unlike a comment
router.post('/:commentId/like', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const commentStore = createCommentStore();
    await commentStore.start();

    const comment = await commentStore.get(commentId);
    if (!comment || comment.isDeleted === true) {
      await commentStore.close();
      return res.status(404).json({ error: 'Comment not found' });
    }

    const likeIndex = comment.likes.indexOf(userId);
    if (likeIndex > -1) {
      comment.likes.splice(likeIndex, 1);
    } else {
      comment.likes.push(userId);
    }

    comment.updatedAt = new Date().toISOString();

    await commentStore.put(commentId, comment);
    await commentStore.close();

    res.json({
      message: likeIndex > -1 ? 'Comment unliked' : 'Comment liked',
      likes: comment.likes,
      isLiked: likeIndex === -1
    });

  } catch (error) {
    console.error('Like comment error:', error);
    res.status(500).json({ error: 'Failed to like/unlike comment' });
  }
});

module.exports = router; 