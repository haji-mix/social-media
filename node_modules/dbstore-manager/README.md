
# dbstore

A flexible, asynchronous key-value store for Node.js with support for MongoDB and PostgreSQL backends. Features built-in AES-256-GCM encryption (optional) and a utility for generating secure random keys. Designed for simplicity, performance, and security, `dbstore` is ideal for storing and retrieving key-value pairs in a variety of applications.

## Features
- **Dual Database Support**: Store data in MongoDB or PostgreSQL with a unified API.
- **Optional Encryption**: Securely encrypt values using AES-256-GCM with user-provided or generated keys.
- **Connection Management**: Automatic connection pooling for MongoDB and PostgreSQL.
- **Error Handling**: Configurable error tolerance with detailed logging via `pino`.
- **Key Generation**: Built-in utility to generate cryptographically secure random keys.
- **Asynchronous API**: Promise-based methods for modern JavaScript applications.
- **Backward Compatibility**: Handles unencrypted data for seamless upgrades.

## Installation

Install the package and required dependencies via npm:

```bash
npm install dbstore pg pino mongoose
```

**Dependencies**:
- `pg` (^8.11.0): For PostgreSQL support.
- `pino` (^8.0.0): For logging.
- `mongoose` (^8.0.2): For MongoDB support (optional if only using PostgreSQL).
- `crypto`: Built-in Node.js module (no installation needed).

**Node.js Version**: Requires Node.js 14 or later for full async/await support.

## Quick Start

### PostgreSQL Example (Unencrypted)

```javascript
const { createStore } = require('dbstore-manager');
const pino = require('pino');

const logger = pino({ level: 'debug' });

async function main() {
  const store = createStore({
    type: 'postgresql',
    uri: 'postgresql://user:password@localhost:5432/mydb?sslmode=require',
    table: 'mytable',
    logger,
    ignoreError: true,
    allowClear: true,
    connectionOptions: { max: 10 },
  });

  try {
    await store.start();
    await store.put('key1', { data: 'value1' });
    console.log(await store.get('key1')); // { data: 'value1' }
    await store.close();
  } catch (error) {
    logger.error('Error:', error);
  }
}

main();
```

### MongoDB Example (Encrypted)

```javascript
const { createStore, generateBytes } = require('dbstore-manager');
const pino = require('pino');

const logger = pino({ level: 'debug' });

// Generate a 32-byte key for AES-256-GCM
const encryptionKey = generateBytes(32, 'hex', logger);

async function main() {
  const store = createStore({
    type: 'mongodb',
    uri: 'mongodb://localhost:27017/mydb',
    collection: 'mycollection',
    encryptionKey,
    logger,
    ignoreError: true,
    allowClear: true,
    connectionOptions: { maxPoolSize: 5 },
  });

  try {
    await store.start();
    await store.put('key1', { data: 'value1' });
    console.log(await store.get('key1')); // { data: 'value1' }
    await store.close();
  } catch (error) {
    logger.error('Error:', error);
  }
}

main();
```

### Generating a Key

```javascript
const { generateBytes } = require('dbstore-manager');
const pino = require('pino');

const logger = pino({ level: 'debug' });
const key = generateBytes(32, 'hex', logger);
console.log(`Generated key: ${key}`); // 64-character hex string
```

## Usage Guide

### 1. Setting Up the Store

The `createStore` function creates a store instance for either MongoDB or PostgreSQL.

```javascript
const { createStore } = require('dbstore-manager');
const store = createStore({
  type: 'postgresql', // or 'mongodb'
  uri: 'postgresql://user:password@localhost:5432/mydb',
  table: 'mytable', // or 'collection' for MongoDB
  logger: require('pino')({ level: 'debug' }),
});
```

### 2. Basic Operations

- **Start the store**:
  ```javascript
  await store.start();
  ```
  Connects to the database and initializes the table/collection.

- **Store a key-value pair**:
  ```javascript
  await store.put('key1', { data: 'value1' });
  ```

- **Retrieve a value**:
  ```javascript
  const value = await store.get('key1'); // { data: 'value1' }
  ```

- **Close the store**:
  ```javascript
  await store.close();
  ```

### 3. Using Encryption

Enable encryption by providing a 32-byte key via `encryptionKey` or the `ENCRYPTION_KEY` environment variable.

```javascript
const store = createStore({
  type: 'postgresql',
  uri: 'postgresql://user:password@localhost:5432/mydb',
  table: 'mytable',
  encryptionKey: '12345678901234567890123456789012', // 32 bytes
  logger: require('pino')({ level: 'debug' }),
});
```

Values are automatically encrypted before storage and decrypted on retrieval. Without an `encryptionKey`, values are stored unencrypted.

### 4. Generating an Encryption Key

Use the `generateBytes` function to create a secure key:

```javascript
const { generateBytes } = require('dbstore-manager');
const key = generateBytes(32, 'hex'); // 64-character hex string
process.env.ENCRYPTION_KEY = key; // Store in environment
```

### 5. Bulk Operations

Store multiple key-value pairs efficiently:

```javascript
await store.bulkPut({
  key1: { data: 'value1' },
  key2: { data: 'value2' },
});
```

### 6. Iterating Over Data

Use async iterators to process keys, values, or entries:

```javascript
for await (const key of store.iKeys()) {
  console.log(key);
}
for await (const value of store.iValues()) {
  console.log(value);
}
for await (const { key, value } of store) {
  console.log(key, value);
}
```

## API Reference

### `createStore(options)`

Creates a store instance.

**Parameters**:
- `options`: Object with configuration (see [Configuration Options](#configuration-options)).

**Returns**: `MongoStore` or `PostgresStore` instance.

### `generateBytes(length, encoding, logger)`

Generates a cryptographically secure random byte string.

**Parameters**:
- `length` (number, optional): Number of bytes to generate (default: 32).
- `encoding` (string, optional): Output encoding ('hex', 'base64', 'utf8'; default: 'hex').
- `logger` (object, optional): Pino logger instance (default: new `pino` instance).

**Returns**: String of random bytes in the specified encoding.

**Example**:
```javascript
const key = generateBytes(32, 'base64'); // ~44-character base64 string
```

### Store Methods

Both `MongoStore` and `PostgresStore` implement the following methods:

- `start(): Promise<void>`: Initializes the database connection and schema.
- `get(key: string): Promise<any>`: Retrieves the value for a key or `null` if not found.
- `put(key: string, value: any): Promise<void>`: Stores a key-value pair.
- `bulkPut(pairs: Record<string, any>): Promise<void>`: Stores multiple key-value pairs.
- `remove(key: string): Promise<void>`: Deletes a key.
- `containsKey(key: string): Promise<boolean>`: Checks if a key exists.
- `size(): Promise<number>`: Returns the number of key-value pairs.
- `keys(): Promise<string[]>`: Returns an array of all keys.
- `values(): Promise<any[]>`: Returns an array of all values.
- `entries(): Promise<Array<{key: string, value: any}>>`: Returns an array of key-value pairs.
- `load(): Promise<Record<string, any>>`: Loads all key-value pairs as an object.
- `clear(): Promise<void>`: Deletes all key-value pairs (if `allowClear` is `true`).
- `toObject(): Promise<Record<string, any>>`: Returns all key-value pairs as an object.
- `toJSON(): Promise<Record<string, any>>`: Same as `toObject`.
- `close(): Promise<void>`: Closes the database connection.
- `[Symbol.iterator](): AsyncIterator<{key: string, value: any}>`: Iterates over entries.
- `iKeys(): AsyncIterator<string>`: Iterates over keys.
- `iValues(): AsyncIterator<any>`: Iterates over values.

### Configuration Options

| Option              | Type    | Default            | Description                                                                 |
|---------------------|---------|--------------------|-----------------------------------------------------------------------------|
| `type`              | string  | `'mongodb'`        | Database type: `'mongodb'` or `'postgresql'`.                                |
| `uri`               | string  | Required           | Database connection URI (e.g., `mongodb://localhost:27017/mydb`).           |
| `database`          | string  | None               | MongoDB database name (appended to URI if provided).                        |
| `collection`        | string  | `'keyvalue'`       | MongoDB collection name.                                                   |
| `table`             | string  | `'keyvalue'`       | PostgreSQL table name.                                                     |
| `encryptionKey`     | string  | `process.env.ENCRYPTION_KEY` | 32-byte key for AES-256-GCM encryption (optional).                |
| `logger`            | object  | `pino({ level: 'info' })` | Pino logger instance for logging.                             |
| `ignoreError`       | boolean | `false`            | If `true`, logs errors instead of throwing (use cautiously).                |
| `allowClear`        | boolean | `false`            | If `true`, allows clearing the table/collection with `clear()`.             |
| `connectionOptions` | object  | `{}`               | Database-specific options (e.g., `{ max: 10 }` for PostgreSQL pool size).   |

### Database Schema

- **MongoDB**:
  - Collection: Specified by `collection` option.
  - Schema: `{ key: String (unique), value: Mixed, createdAt: Date, updatedAt: Date }`.
  - Encrypted values: `{ ciphertext: string, iv: string, authTag: string }`.

- **PostgreSQL**:
  - Table: Specified by `table` option.
  - Schema: `key VARCHAR(255) PRIMARY KEY, value JSONB NOT NULL, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ`.
  - Encrypted values: `{ ciphertext: string, iv: string, authTag: string }` in JSONB.

## Security Considerations

- **Encryption**: Use a 32-byte key for AES-256-GCM encryption. Generate keys with `generateBytes(32, 'hex')` for security.
- **Key Storage**: Store encryption keys in environment variables or a secrets manager, not in code:
  ```bash
  export ENCRYPTION_KEY=$(node -e "console.log(require('dbstore-manager').generateBytes(32, 'hex'))")
  ```
- **Unencrypted Mode**: If no `encryptionKey` is provided, data is stored in plaintext. Ensure this aligns with your security requirements.
- **SSL**: For PostgreSQL (e.g., Neon), use `sslmode=require` in the URI. Configure `connectionOptions.ssl` if needed:
  ```javascript
  connectionOptions: { max: 10, ssl: { rejectUnauthorized: false } }
  ```
- **Permissions**: Ensure the database user has permissions to create and modify tables/collections.
- **Key Rotation**: Not supported natively. Implement custom logic to decrypt and re-encrypt data for key rotation.

## Troubleshooting

- **Connection Errors**:
  - Verify the database URI with `psql` (PostgreSQL) or `mongo` (MongoDB).
  - Check network access and firewall settings.
  - For SSL issues, try `connectionOptions: { ssl: { rejectUnauthorized: false } }` (use cautiously).

- **Encryption Errors**:
  - Ensure the `encryptionKey` is exactly 32 bytes (e.g., 64 hex characters or ~44 base64 characters).
  - Check logs for decryption errors, which may indicate a mismatched key.

- **Permission Issues**:
  - Grant necessary permissions:
    ```sql
    GRANT ALL ON TABLE mytable TO your_user;
    ```

- **Debugging**:
  - Set `logger` to `pino({ level: 'debug' })` or `pino({ level: 'trace' })` for detailed logs.
  - Set `ignoreError: false` to throw errors instead of logging them.

## Example: Using with Neon PostgreSQL

```javascript
const { createStore, generateBytes } = require('dbstore-manager');
const pino = require('pino');

const logger = pino({ level: 'debug' });
const encryptionKey = generateBytes(32, 'hex', logger);

async function main() {
  const store = createStore({
    type: 'postgresql',
    uri: 'postgresql://neondb_owner:npg_U1TB8ZfSpizP@ep-delicate-mountain-a8lznvty-pooler.eastus2.azure.neon.tech/neondb?sslmode=require',
    table: 'mytable',
    encryptionKey,
    logger,
    ignoreError: true,
    allowClear: true,
    connectionOptions: { max: 10 },
  });

  try {
    await store.start();
    await store.put('key1', { data: 'value1' });
    console.log(await store.get('key1')); // { data: 'value1' }
    await store.close();
  } catch (error) {
    logger.error('Error:', error);
  }
}

main();
```

**Database Query**:
```sql
SELECT * FROM mytable;
```
Encrypted output:
```json
{
  "key": "key1",
  "value": { "ciphertext": "...", "iv": "...", "authTag": "..." },
  "created_at": "...",
  "updated_at": "..."
}
```

## Acknowledgments

`dbstore` is a modified and extended version of the `lia-mongo` npm package by Liane Cagara. Significant enhancements include PostgreSQL support, AES-256-GCM encryption, and a key generation utility. The original `lia-mongo` package provided the foundation for the MongoDB implementation.

- Original package: [lia-mongo on npm](https://www.npmjs.com/package/lia-mongo)
- Original author: Liane Cagara
- Repository: [lia-mongo GitHub repository](https://github.com/lianecagara/lia-mongo)

