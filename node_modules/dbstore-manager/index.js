const mongoose = require("mongoose");
const { Pool } = require("pg");
const pino = require("pino");
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const DERIVED_KEY_LENGTH = 32; // Required for AES-256-GCM
const IV_LENGTH = 12;

function generateBytes(
  length = DERIVED_KEY_LENGTH,
  encoding = "hex",
  logger = pino({ level: "info" })
) {
  try {
    if (!Number.isInteger(length) || length <= 0) {
      throw new Error(`Byte length must be a positive integer, got ${length}`);
    }
    const bytes = crypto.randomBytes(length);
    const byteString = bytes.toString(encoding);
    logger.debug(`Generated ${length} bytes in ${encoding} encoding`);
    return byteString;
  } catch (error) {
    logger.error("Byte generation error:", error.message);
    throw new Error(`Failed to generate bytes: ${error.message}`);
  }
}

function getEncryptionKey(options, logger) {
  const key = options.encryptionKey || process.env.ENCRYPTION_KEY;
  if (!key) {
    logger.debug("No encryption key provided; storing values unencrypted.");
    return null;
  }

  try {
    let keyBuffer = Buffer.from(key);
    if (keyBuffer.length === DERIVED_KEY_LENGTH) {
      logger.debug("Encryption key is 32 bytes; using directly.");
      return keyBuffer;
    }

    logger.debug(
      `Input key length is ${keyBuffer.length} bytes; deriving 32-byte key with PBKDF2.`
    );
    const salt = crypto.randomBytes(16);
    keyBuffer = crypto.pbkdf2Sync(
      keyBuffer,
      salt,
      100000,
      DERIVED_KEY_LENGTH,
      "sha256"
    );
    logger.debug("Derived 32-byte encryption key successfully.");
    return keyBuffer;
  } catch (error) {
    logger.error("Encryption key processing error:", error.message);
    throw new Error(`Failed to process encryption key: ${error.message}`);
  }
}

function encrypt(value, keyBuffer, logger) {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    const valueString = JSON.stringify(value);
    let ciphertext = cipher.update(valueString, "utf8", "base64");
    ciphertext += cipher.final("base64");
    const authTag = cipher.getAuthTag().toString("base64");
    logger.debug("Value encrypted successfully.");
    return { ciphertext, iv: iv.toString("base64"), authTag };
  } catch (error) {
    logger.error("Encryption error:", error.message);
    throw new Error("Failed to encrypt value");
  }
}

function decrypt(encrypted, keyBuffer, logger) {
  try {
    if (
      !encrypted ||
      !encrypted.ciphertext ||
      !encrypted.iv ||
      !encrypted.authTag
    ) {
      logger.debug("Data appears unencrypted; returning as-is.");
      return encrypted;
    }
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      keyBuffer,
      Buffer.from(encrypted.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
    let decrypted = decipher.update(encrypted.ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");
    logger.debug("Value decrypted successfully.");
    return JSON.parse(decrypted);
  } catch (error) {
    logger.error("Decryption error:", error.message);
    throw new Error("Failed to decrypt value");
  }
}

class MongoConnectionManager {
  static connections = new Map();
  static logger;

  static initialize(logger) {
    this.logger = logger;
  }

  static async getConnection(uri, options = {}) {
    if (this.connections.has(uri)) {
      const connection = this.connections.get(uri);
      if (connection.readyState === 1 || connection.readyState === 2) {
        return connection;
      }
      this.connections.delete(uri);
    }

    try {
      mongoose.set("strictQuery", true);
      const connection = await mongoose
        .createConnection(uri, {
          retryWrites: true,
          w: "majority",
          connectTimeoutMS: 10000,
          maxPoolSize: 10,
          ...options,
        })
        .asPromise();

      this.connections.set(uri, connection);
      this.logger.info(`MongoDB connected: ${uri}`);
      return connection;
    } catch (error) {
      this.logger.error(`MongoDB connection failed: ${uri}`, error);
      throw new Error(
        `Failed to connect to MongoDB at ${uri}: ${error.message}`
      );
    }
  }

  static async closeConnection(uri) {
    if (this.connections.has(uri)) {
      const connection = this.connections.get(uri);
      await connection.close();
      this.connections.delete(uri);
      this.logger.debug(`MongoDB connection closed: ${uri}`);
    }
  }

  static async closeAllConnections() {
    for (const [uri, connection] of this.connections) {
      await connection.close();
      this.connections.delete(uri);
      this.logger.debug(`MongoDB connection closed: ${uri}`);
    }
  }
}

class PostgresConnectionManager {
  static pools = new Map();
  static logger;

  static initialize(logger) {
    this.logger = logger;
  }

  static async getPool(uri, options = {}) {
    if (this.pools.has(uri)) {
      return this.pools.get(uri);
    }

    try {
      const pool = new Pool({
        connectionString: uri,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ...options,
      });

      await pool.query("SELECT NOW()");
      this.pools.set(uri, pool);
      this.logger.info(`PostgreSQL pool created: ${uri}`);
      return pool;
    } catch (error) {
      this.logger.error(`PostgreSQL connection failed: ${uri}`, error);
      throw new Error(
        `Failed to connect to PostgreSQL at ${uri}: ${error.message}`
      );
    }
  }

  static async closePool(uri) {
    if (this.pools.has(uri)) {
      const pool = this.pools.get(uri);
      await pool.end();
      this.pools.delete(uri);
      this.logger.debug(`PostgreSQL pool closed: ${uri}`);
    }
  }

  static async closeAllPools() {
    for (const [uri, pool] of this.pools) {
      await pool.end();
      this.pools.delete(uri);
      this.logger.debug(`PostgreSQL pool closed: ${uri}`);
    }
  }
}

class Store {
  constructor(options) {
    this.logger = options.logger || pino({ level: "info" });
    this.encryptionKey = getEncryptionKey(options, this.logger);
  }

  async start() {}
  async get(key) {}
  async put(key, value) {}
  async bulkPut(pairs) {}
  async remove(key) {}
  async containsKey(key) {}
  async size() {}
  async keys() {}
  async values() {}
  async entries() {}
  async preProc(data) {}
  async load() {}
  async clear() {}
  async toObject() {}
  async toJSON() {}
  async *[Symbol.iterator]() {}
  async *iKeys() {}
  async *iValues() {}
  async close() {}
}

class MongoStore extends Store {
  constructor(options) {
    super(options);
    this.uri = options.database
      ? `${options.uri.replace(/\/[^\/]*$/, "")}/${options.database}`
      : options.uri;
    this.collectionName = options.collection || "keyvalue";
    this.ignoreError = options.ignoreError || false;
    this.allowClear = options.allowClear || false;
    this.connection = null;
    this.KeyValue = null;
    this.options = options;
  }

  async start() {
    try {
      this.connection = await MongoConnectionManager.getConnection(this.uri, {
        ...(this.options.connectionOptions || {}),
      });

      const keyValueSchema = new mongoose.Schema(
        {
          key: { type: String, required: true, unique: true },
          value: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
          },
        },
        { timestamps: true }
      );

      this.KeyValue = this.connection.model(
        this.collectionName,
        keyValueSchema
      );
      this.logger.info(
        `MongoStore initialized for collection: ${this.collectionName}`
      );
    } catch (error) {
      if (this.ignoreError) {
        this.logger.error(`MongoStore start error (ignored): ${error.message}`);
        return;
      }
      throw error;
    }
  }

  async get(key) {
    try {
      const result = await this.KeyValue.findOne({ key: String(key) });
      if (!result) return null;
      return this.encryptionKey
        ? decrypt(result.value, this.encryptionKey, this.logger)
        : result.value;
    } catch (error) {
      this.logger.error(`MongoStore get error for key ${key}`, error);
      if (this.ignoreError) return null;
      throw error;
    }
  }

  async put(key, value) {
    try {
      const storeValue = this.encryptionKey
        ? encrypt(value, this.encryptionKey, this.logger)
        : value;
      await this.KeyValue.findOneAndUpdate(
        { key: String(key) },
        { key: String(key), value: storeValue },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      this.logger.debug(`MongoStore put key: ${key}`);
    } catch (error) {
      this.logger.error(`MongoStore put error for key ${key}`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async bulkPut(pairs) {
    try {
      const operations = Object.entries(pairs).map(([key, value]) => ({
        updateOne: {
          filter: { key: String(key) },
          update: {
            key: String(key),
            value: this.encryptionKey
              ? encrypt(value, this.encryptionKey, this.logger)
              : value,
          },
          upsert: true,
        },
      }));
      await this.KeyValue.bulkWrite(operations);
      this.logger.debug(
        `MongoStore bulkPut ${Object.keys(pairs).length} items`
      );
    } catch (error) {
      this.logger.error(`MongoStore bulkPut error`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async remove(key) {
    try {
      await this.KeyValue.deleteOne({ key: String(key) });
      this.logger.debug(`MongoStore removed key: ${key}`);
    } catch (error) {
      this.logger.error(`MongoStore remove error for key ${key}`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async containsKey(key) {
    try {
      const count = await this.KeyValue.countDocuments({ key: String(key) });
      return count > 0;
    } catch (error) {
      this.logger.error(`MongoStore containsKey error for key ${key}`, error);
      if (this.ignoreError) return false;
      throw error;
    }
  }

  async size() {
    try {
      return await this.KeyValue.countDocuments();
    } catch (error) {
      this.logger.error(`MongoStore size error`, error);
      if (this.ignoreError) return 0;
      throw error;
    }
  }

  async keys() {
    try {
      const results = await this.KeyValue.find({}, "key");
      return results.map((doc) => doc.key);
    } catch (error) {
      this.logger.error(`MongoStore keys error`, error);
      if (this.ignoreError) return [];
      throw error;
    }
  }

  async values() {
    try {
      const results = await this.KeyValue.find({}, "value");
      return results.map((doc) =>
        this.encryptionKey
          ? decrypt(doc.value, this.encryptionKey, this.logger)
          : doc.value
      );
    } catch (error) {
      this.logger.error(`MongoStore values error`, error);
      if (this.ignoreError) return [];
      throw error;
    }
  }

  async entries() {
    try {
      const results = await this.KeyValue.find({}, "key value");
      return results.map((doc) => ({
        key: doc.key,
        value: this.encryptionKey
          ? decrypt(doc.value, this.encryptionKey, this.logger)
          : doc.value,
      }));
    } catch (error) {
      this.logger.error(`MongoStore entries error`, error);
      if (this.ignoreError) return [];
      throw error;
    }
  }

  async preProc(data) {
    return data;
  }

  async load() {
    const entries = await this.entries();
    const result = Object.fromEntries(
      entries.map(({ key, value }) => [key, value])
    );
    return await this.preProc(result);
  }

  async clear() {
    if (!this.allowClear) {
      throw new Error("Clearing the collection is not allowed");
    }
    try {
      await this.KeyValue.deleteMany({});
      this.logger.info(`MongoStore cleared collection: ${this.collectionName}`);
    } catch (error) {
      this.logger.error(`MongoStore clear error`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async toObject() {
    const entries = await this.entries();
    return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
  }

  async toJSON() {
    return await this.toObject();
  }

  async *[Symbol.iterator]() {
    const entries = await this.entries();
    yield* entries;
  }

  async *iKeys() {
    const keys = await this.keys();
    for (const key of keys) {
      yield key;
    }
  }

  async *iValues() {
    const values = await this.values();
    for (const value of values) {
      yield value;
    }
  }

  async close() {
    if (this.connection) {
      await MongoConnectionManager.closeConnection(this.uri);
      this.connection = null;
      this.KeyValue = null;
      this.logger.info(
        `MongoStore closed for collection: ${this.collectionName}`
      );
    }
  }
}

class PostgresStore extends Store {
  constructor(options) {
    super(options);
    this.uri = options.uri;
    this.tableName = options.table || "keyvalue";
    this.ignoreError = options.ignoreError || false;
    this.allowClear = options.allowClear || false;
    this.pool = null;
    this.options = options;
  }

  async start() {
    try {
      this.pool = await PostgresConnectionManager.getPool(this.uri, {
        ...(this.options.connectionOptions || {}),
      });

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          key VARCHAR(255) PRIMARY KEY,
          value JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this.logger.info(
        `PostgresStore initialized for table: ${this.tableName}`
      );
    } catch (error) {
      if (this.ignoreError) {
        this.logger.error(
          `PostgresStore start error (ignored): ${error.message}`
        );
        return;
      }
      throw error;
    }
  }

  async get(key) {
    try {
      const result = await this.pool.query(
        `SELECT value FROM ${this.tableName} WHERE key = $1`,
        [String(key)]
      );
      if (!result.rows[0]) return null;
      return this.encryptionKey
        ? decrypt(result.rows[0].value, this.encryptionKey, this.logger)
        : result.rows[0].value;
    } catch (error) {
      this.logger.error(`PostgresStore get error for key ${key}`, error);
      if (this.ignoreError) return null;
      throw error;
    }
  }

  async put(key, value) {
    try {
      const storeValue = this.encryptionKey
        ? encrypt(value, this.encryptionKey, this.logger)
        : value;
      await this.pool.query(
        `
        INSERT INTO ${this.tableName} (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `,
        [String(key), storeValue]
      );
      this.logger.debug(`PostgresStore put key: ${key}`);
    } catch (error) {
      this.logger.error(`PostgresStore put error for key ${key}`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async bulkPut(pairs) {
    try {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        for (const [key, value] of Object.entries(pairs)) {
          const storeValue = this.encryptionKey
            ? encrypt(value, this.encryptionKey, this.logger)
            : value;
          await client.query(
            `
            INSERT INTO ${this.tableName} (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
          `,
            [String(key), storeValue]
          );
        }
        await client.query("COMMIT");
        this.logger.debug(
          `PostgresStore bulkPut ${Object.keys(pairs).length} items`
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      this.logger.error(`PostgresStore bulkPut error`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async remove(key) {
    try {
      await this.pool.query(`DELETE FROM ${this.tableName} WHERE key = $1`, [
        String(key),
      ]);
      this.logger.debug(`PostgresStore removed key: ${key}`);
    } catch (error) {
      this.logger.error(`PostgresStore remove error for key ${key}`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async containsKey(key) {
    try {
      const result = await this.pool.query(
        `SELECT EXISTS (SELECT 1 FROM ${this.tableName} WHERE key = $1)`,
        [String(key)]
      );
      return result.rows[0].exists;
    } catch (error) {
      this.logger.error(
        `PostgresStore containsKey error for key ${key}`,
        error
      );
      if (this.ignoreError) return false;
      throw error;
    }
  }

  async size() {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) FROM ${this.tableName}`
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      this.logger.error(`PostgresStore size error`, error);
      if (this.ignoreError) return 0;
      throw error;
    }
  }

  async keys() {
    try {
      const result = await this.pool.query(`SELECT key FROM ${this.tableName}`);
      return result.rows.map((row) => row.key);
    } catch (error) {
      this.logger.error(`PostgresStore keys error`, error);
      if (this.ignoreError) return [];
      throw error;
    }
  }

  async values() {
    try {
      const result = await this.pool.query(
        `SELECT value FROM ${this.tableName}`
      );
      return result.rows.map((row) =>
        this.encryptionKey
          ? decrypt(row.value, this.encryptionKey, this.logger)
          : row.value
      );
    } catch (error) {
      this.logger.error(`PostgresStore values error`, error);
      if (this.ignoreError) return [];
      throw error;
    }
  }

  async entries() {
    try {
      const result = await this.pool.query(
        `SELECT key, value FROM ${this.tableName}`
      );
      return result.rows.map((row) => ({
        key: row.key,
        value: this.encryptionKey
          ? decrypt(row.value, this.encryptionKey, this.logger)
          : row.value,
      }));
    } catch (error) {
      this.logger.error(`PostgresStore entries error`, error);
      if (this.ignoreError) return [];
      throw error;
    }
  }

  async preProc(data) {
    return data;
  }

  async load() {
    const entries = await this.entries();
    const result = Object.fromEntries(
      entries.map(({ key, value }) => [key, value])
    );
    return await this.preProc(result);
  }

  async clear() {
    if (!this.allowClear) {
      throw new Error("Clearing the table is not allowed");
    }
    try {
      await this.pool.query(`DELETE FROM ${this.tableName}`);
      this.logger.info(`PostgresStore cleared table: ${this.tableName}`);
    } catch (error) {
      this.logger.error(`PostgresStore clear error`, error);
      if (!this.ignoreError) throw error;
    }
  }

  async toObject() {
    const entries = await this.entries();
    return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
  }

  async toJSON() {
    return await this.toObject();
  }

  async *[Symbol.iterator]() {
    const entries = await this.entries();
    yield* entries;
  }

  async *iKeys() {
    const keys = await this.keys();
    for (const key of keys) {
      yield key;
    }
  }

  async *iValues() {
    const values = await this.values();
    for (const value of values) {
      yield value;
    }
  }

  async close() {
    if (this.pool) {
      await PostgresConnectionManager.closePool(this.uri);
      this.pool = null;
      this.logger.info(`PostgresStore closed for table: ${this.tableName}`);
    }
  }
}

function createStore(options) {
  const logger = options.logger || pino({ level: "info" });

  MongoConnectionManager.initialize(logger);
  PostgresConnectionManager.initialize(logger);

  const type = options.type || "mongodb";
  switch (type) {
    case "mongodb":
      return new MongoStore(options);
    case "postgresql":
      return new PostgresStore(options);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}

module.exports = {
  Store,
  MongoStore,
  PostgresStore,
  createStore,
  MongoConnectionManager,
  PostgresConnectionManager,
  generateBytes,
};
