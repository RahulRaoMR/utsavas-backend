const multer = require("multer");
const multerS3 = require("multer-s3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const s3 = require("../lib/s3");

const uploadsDir = path.join(__dirname, "..", "uploads", "halls");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const s3UploadsEnabled =
  String(process.env.USE_S3_UPLOADS || "").toLowerCase() === "true" ||
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

const hasWorkingS3Config =
  s3UploadsEnabled &&
  Boolean(process.env.AWS_BUCKET_NAME) &&
  Boolean(process.env.AWS_REGION) &&
  Boolean(process.env.AWS_ACCESS_KEY_ID) &&
  Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
  !String(process.env.AWS_ACCESS_KEY_ID).includes("YOUR_REAL_KEY") &&
  !String(process.env.AWS_SECRET_ACCESS_KEY).includes("YOUR_REAL_SECRET");

const allowedImageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const buildSafeImageFileName = (originalName, fallbackName = "hall-image") => {
  const ext = path.extname(originalName || "").toLowerCase();
  const baseName = path
    .basename(originalName || fallbackName, ext)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  const uniquePart =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString("hex");

  return `${Date.now()}-${uniquePart}-${baseName || fallbackName}${ext}`;
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  if (allowedImageTypes.get(ext) === mimeType) {
    cb(null, true);
    return;
  }

  cb(new Error("Only JPG, JPEG, PNG, or WEBP image files are allowed"));
};

const storage = hasWorkingS3Config
  ? multerS3({
      s3: s3,
      bucket: process.env.AWS_BUCKET_NAME,
      contentType: multerS3.AUTO_CONTENT_TYPE,

      metadata: (req, file, cb) => {
        cb(null, { fieldName: file.fieldname });
      },

      key: (req, file, cb) => {
        cb(null, `halls/${buildSafeImageFileName(file.originalname)}`);
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        cb(null, buildSafeImageFileName(file.originalname));
      },
    });

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
