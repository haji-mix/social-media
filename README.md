# Social Media Platform

A Facebook-like social media platform built with Node.js, Express, and the dbstore database system. Supports MongoDB and PostgreSQL with optional AES-256-GCM encryption.

## 🚀 Features

- **User Authentication**: Secure registration, login, JWT authentication
- **User Profiles**: Customizable profiles with avatars and privacy settings
- **Posts & Feed**: Create, read, update, delete posts with privacy controls
- **Comments**: Add, edit, delete, and like comments
- **Friend System**: Send, accept, reject friend requests
- **Real-time Messaging**: Private messaging between friends
- **Real-time Updates**: Live notifications and feed updates
- **Search**: Search for users by name or username
- **Privacy Controls**: Public, friends-only, and private content

## 📋 Prerequisites

- Node.js (v14 or higher)
- PostgreSQL or MongoDB
- npm or yarn

## 🛠️ Installation

1. **Clone and install**
   ```bash
   git clone <repository-url>
   cd social-media-platform
   npm install
   ```

2. **Environment setup**
   Create `.env` file:
   ```env
   DB_TYPE=postgresql
   DATABASE_URL=postgresql://username:password@localhost:5432/social_media
   JWT_SECRET=your-secret-key
   ENCRYPTION_KEY=your-32-character-key
   PORT=3000
   NODE_ENV=development
   ```

3. **Start the server**
   ```bash
   npm run dev
   ```

4. **Access the app**
   Open `http://localhost:3000`

## 🏗️ Project Structure

```
social-media-platform/
├── config/database.js      # Database configuration
├── middleware/auth.js      # JWT authentication
├── routes/                 # API routes
│   ├── auth.js            # Authentication
│   ├── users.js           # User management
│   ├── posts.js           # Post management
│   ├── comments.js        # Comment management
│   ├── friends.js         # Friend system
│   └── messages.js        # Messaging
├── public/                # Frontend files
│   ├── index.html         # Main page
│   ├── styles.css         # Styles
│   └── app.js             # Frontend logic
├── server.js              # Express server
└── package.json           # Dependencies
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/search/:query` - Search users

### Posts
- `POST /api/posts` - Create post
- `GET /api/posts/feed` - Get feed
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like/unlike post

### Comments
- `POST /api/comments/:postId` - Add comment
- `GET /api/comments/:postId` - Get comments
- `PUT /api/comments/:id` - Update comment
- `DELETE /api/comments/:id` - Delete comment

### Friends
- `POST /api/friends/request/:userId` - Send request
- `POST /api/friends/accept/:userId` - Accept request
- `POST /api/friends/reject/:userId` - Reject request
- `GET /api/friends/requests` - Get requests

### Messages
- `POST /api/messages/:userId` - Send message
- `GET /api/messages/conversation/:userId` - Get conversation
- `GET /api/messages/conversations` - Get all conversations

## 🗄️ Database Schema

### Users
```javascript
{
  id: "uuid",
  email: "user@example.com",
  username: "username",
  password: "hashed-password",
  firstName: "John",
  lastName: "Doe",
  profile: {
    displayName: "John Doe",
    bio: "User bio",
    avatar: "base64-image",
    coverPhoto: "base64-image",
    location: "City, Country"
  },
  friends: ["friend-id-1"],
  friendRequests: ["request-id-1"],
  createdAt: "2024-01-01T00:00:00.000Z",
  isPrivate: false
}
```

### Posts
```javascript
{
  id: "uuid",
  userId: "user-id",
  content: "Post content",
  images: ["base64-image-1"],
  privacy: "public", // public, friends, private
  likes: ["user-id-1"],
  comments: ["comment-id-1"],
  createdAt: "2024-01-01T00:00:00.000Z",
  isDeleted: false
}
```

### Comments
```javascript
{
  id: "uuid",
  postId: "post-id",
  userId: "user-id",
  content: "Comment content",
  likes: ["user-id-1"],
  createdAt: "2024-01-01T00:00:00.000Z",
  isDeleted: false
}
```

### Messages
```javascript
{
  id: "uuid",
  senderId: "sender-id",
  receiverId: "receiver-id",
  content: "Message content",
  type: "text",
  isRead: false,
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

## 🔧 Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `DB_TYPE` | Database type | postgresql |
| `DATABASE_URL` | Database connection | postgresql://postgres:password@localhost:5432/social_media |
| `JWT_SECRET` | JWT signing secret | your-secret-key-change-in-production |
| `ENCRYPTION_KEY` | Encryption key | auto-generated |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |

## 🚀 Deployment

### Production Setup
1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET` and `ENCRYPTION_KEY`
3. Configure database with SSL
4. Set up reverse proxy (nginx)
5. Use PM2 process manager

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🧪 Testing

```bash
npm test
```

## 📱 Frontend Features

- **Responsive Design**: Works on all devices
- **Modern UI**: Clean, Facebook-inspired interface
- **Real-time Updates**: Live notifications and feed
- **Modal Dialogs**: Post creation and profile editing
- **Toast Notifications**: User feedback

## 🔒 Security

- JWT Authentication
- Password hashing (bcrypt)
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation
- XSS protection

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

## 📄 License

MIT License

## 🔮 Roadmap

- [ ] Video upload and sharing
- [ ] Stories feature
- [ ] Group creation
- [ ] Event management
- [ ] Two-factor authentication
- [ ] Email notifications
- [ ] Mobile app
- [ ] Content moderation
- [ ] Analytics dashboard

---

**Built with ❤️ using Node.js, Express, and dbstore-manager** 