const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    const token =
      req.headers.authorization?.split(" ")[1] ||
      req.headers["x-auth-token"];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token, authorization denied",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("AUTH ERROR:", err.message);
    return res.status(401).json({
      success: false,
      message: "Token is not valid",
    });
  }
};

module.exports = authMiddleware;
