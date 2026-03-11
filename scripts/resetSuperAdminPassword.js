require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/Admin");

const email = (process.argv[2] || "admin@utsavam.com").toLowerCase().trim();
const newPassword = process.argv[3];

if (!newPassword) {
  console.error("Usage: node scripts/resetSuperAdminPassword.js <email> <newPassword>");
  process.exit(1);
}

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in environment");
  }

  await mongoose.connect(process.env.MONGO_URI);

  let admin = await Admin.findOne({ email });

  if (!admin) {
    admin = new Admin({
      email,
      password: newPassword,
      role: "superadmin",
    });
  } else {
    admin.password = newPassword;
  }

  await admin.save();

  console.log(`Super admin password reset successful for ${email}`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Reset failed:", err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
