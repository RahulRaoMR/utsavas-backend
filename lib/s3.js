const { S3Client } = require("@aws-sdk/client-s3");

// 🔍 Debug logs (optional — remove in production)
console.log("KEY:", process.env.AWS_ACCESS_KEY_ID);
console.log("REGION:", process.env.AWS_REGION);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

module.exports = s3;