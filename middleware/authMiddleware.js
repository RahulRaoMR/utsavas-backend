const jwt = require("jsonwebtoken");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }

  return secret;
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || "";

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return (req.headers["x-auth-token"] || "").toString().trim();
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    try {
      const token = getTokenFromRequest(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const decoded = jwt.verify(token, getJwtSecret());

      if (
        allowedRoles.length > 0 &&
        !allowedRoles.includes(String(decoded?.role || "").toLowerCase())
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden",
        });
      }

      req.user = decoded;
      req.authToken = token;
      next();
    } catch (error) {
      console.error("AUTH ERROR:", error.message);

      if (error.message === "JWT_SECRET is missing") {
        return res.status(500).json({
          success: false,
          message: "Authentication is not configured correctly",
        });
      }

      return res.status(401).json({
        success: false,
        message: "Token is not valid",
      });
    }
  };
}

const requireAuth = authorize();
const requireAdmin = authorize("admin");
const requireVendor = authorize("vendor");

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
module.exports.requireVendor = requireVendor;
module.exports.getTokenFromRequest = getTokenFromRequest;
