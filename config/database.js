const { createStore, generateBytes } = require('dbstore-manager');
const pino = require('pino');

const logger = pino({ level: 'debug' });

// Generate encryption key if not provided
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    return process.env.ENCRYPTION_KEY;
  }
  
  // Generate a new key for development
  const key = generateBytes(32, 'hex', logger);
  logger.info('Generated new encryption key for development');
  return key;
};

// Database configuration
const dbConfig = {
  type: process.env.DB_TYPE || 'postgresql',
  uri: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/social_media',
  table: 'social_data',
  encryptionKey: getEncryptionKey(),
  logger,
  ignoreError: false,
  allowClear: process.env.NODE_ENV === 'development',
  connectionOptions: {
    max: 20,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  }
};

// Create store instances for different data types
const createUserStore = () => {
  return createStore({
    ...dbConfig,
    table: 'users'
  });
};

const createPostStore = () => {
  return createStore({
    ...dbConfig,
    table: 'posts'
  });
};

const createCommentStore = () => {
  return createStore({
    ...dbConfig,
    table: 'comments'
  });
};

const createFriendStore = () => {
  return createStore({
    ...dbConfig,
    table: 'friends'
  });
};

const createMessageStore = () => {
  return createStore({
    ...dbConfig,
    table: 'messages'
  });
};

const createNotificationStore = () => {
  return createStore({
    ...dbConfig,
    table: 'notifications'
  });
};

// Initialize all stores
const initializeStores = async () => {
  try {
    const stores = {
      users: createUserStore(),
      posts: createPostStore(),
      comments: createCommentStore(),
      friends: createFriendStore(),
      messages: createMessageStore(),
      notifications: createNotificationStore()
    };

    // Start all stores
    for (const [name, store] of Object.entries(stores)) {
      await store.start();
      logger.info(`Started ${name} store`);
    }

    return stores;
  } catch (error) {
    logger.error('Failed to initialize stores:', error);
    throw error;
  }
};

// Close all stores
const closeStores = async (stores) => {
  try {
    for (const [name, store] of Object.entries(stores)) {
      await store.close();
      logger.info(`Closed ${name} store`);
    }
  } catch (error) {
    logger.error('Failed to close stores:', error);
  }
};

module.exports = {
  createUserStore,
  createPostStore,
  createCommentStore,
  createFriendStore,
  createMessageStore,
  createNotificationStore,
  initializeStores,
  closeStores,
  logger
}; 