const jwt = require("jsonwebtoken");
const db = require("../startup/database");

const auth = (req, res, next) => {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  // Strip quotes if wrapped in quotes
  if (token) {
    token = token.replace(/^["']|["']$/g, "").trim();
  }

  if (!token) {
    console.error("No token provided in request headers:", req.headers);
    return res.status(401).json({
      status: "error",
      message: "No token provided",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("Token verification error:", err);
      return res.status(401).json({
        status: "error",
        message: "Invalid token",
      });
    }

    console.log("Decoded token:", decoded);

    // Verify user status from DB
    const sql = "SELECT status FROM salesagent WHERE id = ?";
    db.collectionofficer.query(sql, [decoded.id], (dbErr, results) => {
      if (dbErr) {
        console.error("Database error during status verification:", dbErr);
        return res.status(500).json({
          success: false,
          message: "Internal server error during authorization verification",
        });
      }

      if (results.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      const userStatus = results[0].status;

      if (userStatus === "Rejected") {
        return res.status(403).json({
          success: false,
          message: "This Employee ID is rejected",
          statusType: "rejected",
        });
      }

      if (userStatus === "Not Approved") {
        return res.status(403).json({
          success: false,
          message: "This Employee ID is not approved",
          statusType: "not_approved",
        });
      }

      if (userStatus !== "Approved") {
        return res.status(403).json({
          success: false,
          message: "Account status is pending verification",
          statusType: "pending",
        });
      }

      // Attach decoded token to request
      req.user = decoded;
      next(); // Continue to the next middleware or route handler
    });
  });
};

module.exports = auth;
