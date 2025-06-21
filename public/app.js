// Global variables
let currentUser = null;
let authToken = localStorage.getItem('authToken');
const API_BASE = '/api';
let socket = null;

// DOM elements
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const loadingSpinner = document.getElementById('loadingSpinner');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
});

function initializeApp() {
    if (authToken) {
        checkAuthStatus();
    } else {
        showAuthContainer();
    }
}

function setupEventListeners() {
    // Auth tabs
    document.getElementById('loginTab').addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('registerTab').addEventListener('click', () => switchAuthTab('register'));
    
    // Auth forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Navigation
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('homeBtn').addEventListener('click', () => loadFeed());
    document.getElementById('profileBtn').addEventListener('click', showProfileModal);
    document.getElementById('friendsBtn').addEventListener('click', loadFriends);
    document.getElementById('messagesBtn').addEventListener('click', loadMessages);
    document.getElementById('notificationsBtn').addEventListener('click', loadNotifications);
    
    // Post creation
    document.getElementById('submitPostBtn').addEventListener('click', createPost);
    document.getElementById('createPostBtn').addEventListener('click', showCreatePostModal);
    document.getElementById('submitModalPostBtn').addEventListener('click', createPostFromModal);
    
    // Modals
    document.getElementById('closePostModal').addEventListener('click', hideCreatePostModal);
    document.getElementById('closeProfileModal').addEventListener('click', hideProfileModal);
    document.getElementById('cancelPostBtn').addEventListener('click', hideCreatePostModal);
    document.getElementById('cancelProfileBtn').addEventListener('click', hideProfileModal);
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
    
    // Search
    document.getElementById('searchInput').addEventListener('input', debounce(handleSearch, 300));
}

// Authentication functions
async function checkAuthStatus() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showAppContainer();
            initializeSocket();
            loadFeed();
            loadUserData();
        } else {
            localStorage.removeItem('authToken');
            showAuthContainer();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('authToken');
        showAuthContainer();
    } finally {
        hideLoading();
    }
}

function switchAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (tab === 'login') {
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
        registerForm.style.display = 'block';
        loginForm.style.display = 'none';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showAppContainer();
            initializeSocket();
            loadFeed();
            loadUserData();
            showToast('Login successful!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Login failed:', error);
        showToast('Login failed. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('registerFirstName').value;
    const lastName = document.getElementById('registerLastName').value;
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ firstName, lastName, username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showAppContainer();
            initializeSocket();
            loadFeed();
            loadUserData();
            showToast('Registration successful!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Registration failed:', error);
        showToast('Registration failed. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    if (socket) {
        socket.disconnect();
    }
    showAuthContainer();
    showToast('Logged out successfully', 'info');
}

// UI functions
function showAuthContainer() {
    authContainer.style.display = 'flex';
    appContainer.style.display = 'none';
}

function showAppContainer() {
    authContainer.style.display = 'none';
    appContainer.style.display = 'block';
}

function showLoading() {
    loadingSpinner.style.display = 'flex';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = document.createElement('i');
    icon.className = `fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} toast-icon`;
    
    const messageEl = document.createElement('div');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(messageEl);
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Socket.IO functions
function initializeSocket() {
    if (!currentUser) return;
    
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('join', currentUser.id);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
    
    socket.on('new_post', (data) => {
        if (data.userId !== currentUser.id) {
            addPostToFeed(data);
        }
    });
    
    socket.on('new_message', (data) => {
        if (data.receiverId === currentUser.id) {
            updateMessageBadge();
        }
    });
}

// Post functions
async function createPost() {
    const content = document.getElementById('postContent').value.trim();
    const privacy = document.getElementById('postPrivacy').value;
    
    if (!content) {
        showToast('Please enter some content', 'error');
        return;
    }
    
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ content, privacy })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('postContent').value = '';
            addPostToFeed(data.post, true);
            showToast('Post created successfully!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Create post failed:', error);
        showToast('Failed to create post', 'error');
    } finally {
        hideLoading();
    }
}

async function loadFeed() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/posts/feed`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayPosts(data.posts);
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Load feed failed:', error);
        showToast('Failed to load feed', 'error');
    } finally {
        hideLoading();
    }
}

function displayPosts(posts) {
    const postsFeed = document.getElementById('postsFeed');
    postsFeed.innerHTML = '';
    
    if (posts.length === 0) {
        postsFeed.innerHTML = '<div class="no-posts">No posts to show. Be the first to post!</div>';
        return;
    }
    
    posts.forEach(post => {
        const postElement = createPostElement(post);
        postsFeed.appendChild(postElement);
    });
}

function createPostElement(post) {
    const postDiv = document.createElement('div');
    postDiv.className = 'post';
    postDiv.dataset.postId = post.id;
    
    const timeAgo = formatTimeAgo(post.createdAt);
    
    postDiv.innerHTML = `
        <div class="post-header">
            <img src="${post.user.profile.avatar || 'https://via.placeholder.com/40'}" alt="Avatar" class="post-user-avatar">
            <div class="post-user-info">
                <h4>${post.user.profile.displayName}</h4>
                <p>${timeAgo} • ${post.privacy}</p>
            </div>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        ${post.images && post.images.length > 0 ? `
            <div class="post-images">
                ${post.images.map(img => `<img src="${img}" alt="Post image" class="post-image">`).join('')}
            </div>
        ` : ''}
        <div class="post-stats">
            <span>${post.likes.length} likes</span>
            <span>${post.comments.length} comments</span>
        </div>
        <div class="post-actions-bar">
            <button class="post-action ${post.likes.includes(currentUser.id) ? 'liked' : ''}" onclick="toggleLike('${post.id}')">
                <i class="fas fa-thumbs-up"></i>
                ${post.likes.includes(currentUser.id) ? 'Liked' : 'Like'}
            </button>
            <button class="post-action" onclick="showComments('${post.id}')">
                <i class="fas fa-comment"></i>
                Comment
            </button>
            <button class="post-action" onclick="sharePost('${post.id}')">
                <i class="fas fa-share"></i>
                Share
            </button>
        </div>
    `;
    
    return postDiv;
}

function addPostToFeed(post, prepend = false) {
    const postsFeed = document.getElementById('postsFeed');
    const postElement = createPostElement(post);
    
    if (prepend) {
        postsFeed.insertBefore(postElement, postsFeed.firstChild);
    } else {
        postsFeed.appendChild(postElement);
    }
}

async function toggleLike(postId) {
    try {
        const response = await fetch(`${API_BASE}/posts/${postId}/like`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const postElement = document.querySelector(`[data-post-id="${postId}"]`);
            const likeButton = postElement.querySelector('.post-action');
            const statsElement = postElement.querySelector('.post-stats');
            
            if (data.isLiked) {
                likeButton.classList.add('liked');
                likeButton.innerHTML = '<i class="fas fa-thumbs-up"></i> Liked';
            } else {
                likeButton.classList.remove('liked');
                likeButton.innerHTML = '<i class="fas fa-thumbs-up"></i> Like';
            }
            
            statsElement.innerHTML = `<span>${data.likes.length} likes</span>`;
        }
    } catch (error) {
        console.error('Toggle like failed:', error);
        showToast('Failed to like post', 'error');
    }
}

// User functions
async function loadUserData() {
    if (!currentUser) return;
    
    // Update avatars
    const avatars = document.querySelectorAll('#userAvatar, #sidebarAvatar, #feedAvatar');
    avatars.forEach(avatar => {
        avatar.src = currentUser.profile.avatar || 'https://via.placeholder.com/40';
    });
    
    // Update names
    document.getElementById('sidebarName').textContent = currentUser.profile.displayName;
    document.getElementById('sidebarUsername').textContent = `@${currentUser.username}`;
    
    // Load friends
    loadFriends();
    
    // Load friend requests
    loadFriendRequests();
}

async function loadFriends() {
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.id}/friends`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayFriends(data.friends);
        }
    } catch (error) {
        console.error('Load friends failed:', error);
    }
}

function displayFriends(friends) {
    const friendsList = document.getElementById('friendsList');
    friendsList.innerHTML = '';
    
    friends.slice(0, 5).forEach(friend => {
        const friendElement = document.createElement('div');
        friendElement.className = 'friend-item';
        friendElement.innerHTML = `
            <img src="${friend.profile.avatar || 'https://via.placeholder.com/32'}" alt="Avatar" class="friend-avatar">
            <span class="friend-name">${friend.profile.displayName}</span>
        `;
        friendsList.appendChild(friendElement);
    });
}

async function loadFriendRequests() {
    try {
        const response = await fetch(`${API_BASE}/friends/requests`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayFriendRequests(data.requests);
        }
    } catch (error) {
        console.error('Load friend requests failed:', error);
    }
}

function displayFriendRequests(requests) {
    const requestsContainer = document.getElementById('friendRequests');
    requestsContainer.innerHTML = '';
    
    if (requests.length === 0) {
        requestsContainer.innerHTML = '<p>No friend requests</p>';
        return;
    }
    
    requests.forEach(request => {
        const requestElement = document.createElement('div');
        requestElement.className = 'friend-request';
        requestElement.innerHTML = `
            <img src="${request.profile.avatar || 'https://via.placeholder.com/40'}" alt="Avatar" class="request-avatar">
            <div class="request-info">
                <div class="request-name">${request.profile.displayName}</div>
                <div class="request-actions">
                    <button class="request-btn accept-btn" onclick="acceptFriendRequest('${request.id}')">Accept</button>
                    <button class="request-btn reject-btn" onclick="rejectFriendRequest('${request.id}')">Reject</button>
                </div>
            </div>
        `;
        requestsContainer.appendChild(requestElement);
    });
}

// Modal functions
function showCreatePostModal() {
    document.getElementById('createPostModal').style.display = 'flex';
}

function hideCreatePostModal() {
    document.getElementById('createPostModal').style.display = 'none';
    document.getElementById('modalPostContent').value = '';
}

function showProfileModal() {
    if (!currentUser) return;
    
    document.getElementById('editDisplayName').value = currentUser.profile.displayName;
    document.getElementById('editBio').value = currentUser.profile.bio;
    document.getElementById('editLocation').value = currentUser.profile.location;
    document.getElementById('editWebsite').value = currentUser.profile.website;
    document.getElementById('editPrivacy').value = currentUser.isPrivate.toString();
    
    document.getElementById('profileModal').style.display = 'flex';
}

function hideProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
}

async function saveProfile() {
    const displayName = document.getElementById('editDisplayName').value;
    const bio = document.getElementById('editBio').value;
    const location = document.getElementById('editLocation').value;
    const website = document.getElementById('editWebsite').value;
    const isPrivate = document.getElementById('editPrivacy').value === 'true';
    
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/users/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                displayName,
                bio,
                location,
                website,
                isPrivate
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            loadUserData();
            hideProfileModal();
            showToast('Profile updated successfully!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Save profile failed:', error);
        showToast('Failed to update profile', 'error');
    } finally {
        hideLoading();
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function handleSearch(e) {
    const query = e.target.value.trim();
    
    if (query.length < 2) return;
    
    try {
        const response = await fetch(`${API_BASE}/users/search/${query}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Handle search results (could show in dropdown)
            console.log('Search results:', data.users);
        }
    } catch (error) {
        console.error('Search failed:', error);
    }
}

// Placeholder functions for future implementation
function loadMessages() {
    showToast('Messages feature coming soon!', 'info');
}

function loadNotifications() {
    showToast('Notifications feature coming soon!', 'info');
}

function showComments(postId) {
    showToast('Comments feature coming soon!', 'info');
}

function sharePost(postId) {
    showToast('Share feature coming soon!', 'info');
}

async function acceptFriendRequest(userId) {
    try {
        const response = await fetch(`${API_BASE}/friends/accept/${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            loadFriendRequests();
            loadFriends();
            showToast('Friend request accepted!', 'success');
        }
    } catch (error) {
        console.error('Accept friend request failed:', error);
        showToast('Failed to accept friend request', 'error');
    }
}

async function rejectFriendRequest(userId) {
    try {
        const response = await fetch(`${API_BASE}/friends/reject/${userId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            loadFriendRequests();
            showToast('Friend request rejected', 'info');
        }
    } catch (error) {
        console.error('Reject friend request failed:', error);
        showToast('Failed to reject friend request', 'error');
    }
}

function updateMessageBadge() {
    const badge = document.getElementById('messageBadge');
    const currentCount = parseInt(badge.textContent) || 0;
    badge.textContent = currentCount + 1;
    badge.style.display = 'block';
}

function createPostFromModal() {
    const content = document.getElementById('modalPostContent').value.trim();
    const privacy = document.getElementById('modalPostPrivacy').value;
    
    if (!content) {
        showToast('Please enter some content', 'error');
        return;
    }
    
    // Use the same createPost logic but with modal content
    createPostFromContent(content, privacy);
    hideCreatePostModal();
}

async function createPostFromContent(content, privacy) {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ content, privacy })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            addPostToFeed(data.post, true);
            showToast('Post created successfully!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error('Create post failed:', error);
        showToast('Failed to create post', 'error');
    } finally {
        hideLoading();
    }
} 