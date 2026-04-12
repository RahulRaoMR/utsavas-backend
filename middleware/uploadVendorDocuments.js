const multer = require("multer");
const multerS3 = require("multer-s3");
const fs = require("fs");
const path = require("path");
const s3 = require("../lib/s3");

const uploadsDir = path.join(__dirname, "..", "uploads", "vendor-documents");
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

const buildSafeFileName = (originalName, fallbackName) => {
  const ext = path.extname(originalName || "");
  const baseName = path
    .basename(originalName || fallbackName, ext)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");

  return `${Date.now()}-${baseName || fallbackName}${ext}`;
};

const storage = hasWorkingS3Config
  ? multerS3({
      s3,
      bucket: process.env.AWS_BUCKET_NAME,
      metadata: (req, file, cb) => {
        cb(null, { fieldName: file.fieldname });
      },
      key: (req, file, cb) => {
        cb(
          null,
          `vendor-documents/${buildSafeFileName(
            file.originalname,
            file.fieldname || "vendor-document"
          )}`
        );
      },
    })
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        cb(
          null,
          buildSafeFileName(
            file.originalname,
            file.fieldname || "vendor-document"
          )
        );
      },
    });

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const allowedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  if (allowedMimeTypes.has(mimeType) || allowedExtensions.has(ext)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only PDF, JPG, JPEG, PNG, or WEBP files are allowed"));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
