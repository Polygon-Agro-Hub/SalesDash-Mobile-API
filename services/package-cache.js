const cache = require("../cache/cache");
const packageDAO = require("../dao/package-dao");

const DEFAULT_PACKAGES_CACHE_KEY = "salesdash_active_packages";

/**
 * Check if the filters match the default query used by mobile home / dashboard.
 */
function isDefaultFilter(filters = {}) {
  const isDefaultStatus = !filters.status || filters.status === "Enabled";
  const noSearch = !filters.search;
  const noMinPrice = filters.minPrice === null || filters.minPrice === undefined;
  const noMaxPrice = filters.maxPrice === null || filters.maxPrice === undefined;
  const noPagination = !filters.limit && !filters.offset;

  return isDefaultStatus && noSearch && noMinPrice && noMaxPrice && noPagination;
}

/**
 * Retrieve cached packages if available for default filters.
 */
function getCachedPackages(filters = {}) {
  if (isDefaultFilter(filters)) {
    const data = cache.get(DEFAULT_PACKAGES_CACHE_KEY);
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  }
  return null;
}

/**
 * Set packages in memory cache.
 */
function setCachedPackages(packages) {
  if (Array.isArray(packages) && packages.length > 0) {
    cache.set(DEFAULT_PACKAGES_CACHE_KEY, packages);
    console.log(`⚡ [PackageCache] Cached ${packages.length} active packages in memory.`);
  }
}

/**
 * Invalidate / clear package cache.
 */
function clearPackageCache() {
  cache.del(DEFAULT_PACKAGES_CACHE_KEY);
  console.log("🧹 [PackageCache] Invalidated package cache.");
}

/**
 * Fetch fresh package data from DB, refresh the in-memory cache, and return results.
 */
async function refreshPackageCache() {
  try {
    const packages = await packageDAO.getAllPackages({ status: "Enabled" });
    setCachedPackages(packages);
    return packages;
  } catch (err) {
    console.error("❌ [PackageCache] Error refreshing package cache:", err);
    throw err;
  }
}

module.exports = {
  getCachedPackages,
  setCachedPackages,
  clearPackageCache,
  refreshPackageCache,
  isDefaultFilter,
};
