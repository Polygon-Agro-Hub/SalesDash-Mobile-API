const cache = require("../cache/cache");

const UNREAD_PREFIX = "salesdash_unread_";

/**
 * Get cached unread notification count for a sales agent.
 */
function getUnreadCount(salesAgentId) {
  if (!salesAgentId) return null;
  const count = cache.get(`${UNREAD_PREFIX}${salesAgentId}`);
  return typeof count === "number" ? count : null;
}

/**
 * Set unread notification count in cache for a sales agent.
 */
function setUnreadCount(salesAgentId, count) {
  if (!salesAgentId) return;
  const safeCount = Math.max(0, parseInt(count, 10) || 0);
  cache.set(`${UNREAD_PREFIX}${salesAgentId}`, safeCount);
}

/**
 * Increment unread count by 1 in cache (when a new notification arrives).
 */
function incrementUnreadCount(salesAgentId) {
  if (!salesAgentId) return 1;
  const current = getUnreadCount(salesAgentId);
  const updated = current !== null ? current + 1 : 1;
  setUnreadCount(salesAgentId, updated);
  return updated;
}

/**
 * Decrement unread count by 1 in cache (when a notification is marked read).
 */
function decrementUnreadCount(salesAgentId) {
  if (!salesAgentId) return 0;
  const current = getUnreadCount(salesAgentId);
  if (current !== null) {
    const updated = Math.max(0, current - 1);
    setUnreadCount(salesAgentId, updated);
    return updated;
  }
  return 0;
}

/**
 * Invalidate cached unread count for a sales agent.
 */
function invalidateUnreadCount(salesAgentId) {
  if (!salesAgentId) return;
  cache.del(`${UNREAD_PREFIX}${salesAgentId}`);
}

module.exports = {
  getUnreadCount,
  setUnreadCount,
  incrementUnreadCount,
  decrementUnreadCount,
  invalidateUnreadCount,
};
