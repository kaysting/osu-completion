const crypto = require('crypto');

const secret = crypto.randomBytes(32).toString('hex');

console.log(`Use this cryptographically secure token as the JWT_TOKEN environment variable:\n${secret}`);