const NodeCache = require("node-cache");

/**
 * Shared in-memory cache instance.
 *
 * stdTTL: 0       => No automatic expiration. Data persists until explicitly updated or invalidated.
 * checkperiod: 0  => No background timer cleanup.
 */
const cache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

module.exports = cache;
