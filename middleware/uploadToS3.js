const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const s3 = require("../lib/s3");

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,

    // ❌ DO NOT ADD ACL HERE (IMPORTANT)

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
  }),

  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;