const NodeCache = require("node-cache");

// Cache TTL: 300 seconds (5 minutes) for completed results, 60 seconds for in-flight requests
const idempotencyCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const idempotency = (req, res, next) => {
  const idempotencyKey = req.headers["x-idempotency-key"];

  // If no idempotency key is provided, proceed normally
  if (!idempotencyKey) {
    return next();
  }

  const cached = idempotencyCache.get(idempotencyKey);

  // 1. If this exact request was already processed successfully, return the cached response
  if (cached && cached.status !== "IN_PROGRESS") {
    return res.status(cached.status).json(cached.body);
  }

  // 2. If this exact request is currently in-flight, reject concurrent duplicate execution
  if (cached && cached.status === "IN_PROGRESS") {
    return res.status(409).json({
      status: "error",
      message: "Request is currently being processed. Please wait.",
    });
  }

  // 3. Lock this key as IN_PROGRESS for 60 seconds
  idempotencyCache.set(idempotencyKey, { status: "IN_PROGRESS" }, 60);

  // Intercept res.json to cache the final response upon completion
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyCache.set(
        idempotencyKey,
        {
          status: res.statusCode,
          body,
        },
        300,
      );
    } else {
      // If the request resulted in an error, clear the lock so the user can legitimately retry
      idempotencyCache.del(idempotencyKey);
    }
    return originalJson(body);
  };

  next();
};

module.exports = idempotency;
