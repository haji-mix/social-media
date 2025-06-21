const { generateBytes } = require('dbstore-manager');

const key = generateBytes(16, 'hex');
console.log(`Generated key: ${key}`);