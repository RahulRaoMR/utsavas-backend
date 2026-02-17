const jwt = require("jsonwebtoken");

module.exports = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || "utsavas_secret",
    {
      expiresIn: "7d",
    }
  );
};
