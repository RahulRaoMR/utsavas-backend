const Razorpay = require("razorpay");

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  throw new Error("Missing Razorpay credentials in environment variables");
}

const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

module.exports = razorpay;
