const multer = require("multer");
const multerS3 = require("multer-s3");
const fs = require("fs");
const path = require("path");
const s3 = require("../lib/s3");

const uploadsDir = path.join(__dirname, "..", "uploads", "halls");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const hasWorkingS3Config =
  Boolean(process.env.AWS_BUCKET_NAME) &&
  Boolean(process.env.AWS_REGION) &&
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
  !String(process.env.AWS_ACCESS_KEY_ID).includes("YOUR_REAL_KEY") &&
  !String(process.env.AWS_SECRET_ACCESS_KEY).includes("YOUR_REAL_SECRET");

const storage = hasWorkingS3Config
  ? multerS3({
      s3: s3,
      bucket: process.env.AWS_BUCKET_NAME,

      metadata: (req, file, cb) => {
        cb(null, { fieldName: file.fieldname });
      },

      key: (req, file, cb) => {
        const fileName =
          Date.now() +
          "-" +
          file.originalname.replace(/\s+/g, "_");

        cb(null, `halls/${fileName}`);
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || "");
        const name = path
          .basename(file.originalname || "hall-image", ext)
          .replace(/\s+/g, "_");

        cb(null, `${Date.now()}-${name}${ext}`);
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
