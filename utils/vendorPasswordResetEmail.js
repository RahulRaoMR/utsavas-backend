const { sendTransactionalEmail } = require("./bookingConfirmationEmail");

function buildVendorResetEmailHtml({ ownerName, businessName, otp }) {
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; background:#f5f7fb; padding:32px; color:#183b63;">
      <div style="max-width:640px; margin:0 auto; background:#fffaf1; border-radius:24px; overflow:hidden; border:1px solid #dfe8f6;">
        <div style="background:linear-gradient(135deg,#5f97d6,#3f6fb6); color:#ffffff; padding:28px 32px;">
          <div style="font-size:13px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.86;">UTSAVAS Vendor Security</div>
          <h1 style="margin:12px 0 8px; font-size:30px; line-height:1.2;">Vendor password reset OTP</h1>
          <p style="margin:0; font-size:16px; line-height:1.7;">Use this OTP to reset your vendor account password.</p>
        </div>

        <div style="padding:32px;">
          <p style="margin:0 0 18px; color:#5e5551; font-size:16px; line-height:1.8;">
            Hello ${ownerName || businessName || "Vendor"},
          </p>

          <p style="margin:0 0 22px; color:#5e5551; font-size:16px; line-height:1.8;">
            We received a request to reset the password for your UTSAVAS vendor account${businessName ? ` for <strong style="color:#183b63;">${businessName}</strong>` : ""}.
            This OTP is valid for 5 minutes.
          </p>

          <div style="margin:0 0 24px; padding:22px; border-radius:20px; background:#edf4ff; border:1px solid #d2e3fb; text-align:center;">
            <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:#7c6a52; margin-bottom:10px;">One-time password</div>
            <div style="font-size:34px; letter-spacing:0.28em; font-weight:700; color:#183b63;">${otp}</div>
          </div>

          <p style="margin:0 0 12px; color:#5e5551; font-size:15px; line-height:1.8;">
            If you did not request this reset, you can safely ignore this email. Your current password will keep working.
          </p>

          <p style="margin:0; color:#7c6a52; font-size:14px; line-height:1.8;">
            UTSAVAS team
          </p>
        </div>
      </div>
    </div>
  `;
}

function buildVendorResetEmailText({ ownerName, businessName, otp }) {
  return [
    "UTSAVAS Vendor Password Reset OTP",
    "",
    `Hello ${ownerName || businessName || "Vendor"},`,
    "",
    businessName
      ? `We received a request to reset the password for your vendor account: ${businessName}.`
      : "We received a request to reset your vendor account password.",
    "Your OTP is valid for 5 minutes.",
    "",
    `OTP: ${otp}`,
    "",
    "If you did not request this reset, you can ignore this email.",
    "",
    "UTSAVAS team",
  ].join("\n");
}

async function sendVendorPasswordResetOtpEmail({
  to,
  ownerName,
  businessName,
  otp,
}) {
  return sendTransactionalEmail({
    to,
    subject: "UTSAVAS vendor password reset OTP",
    html: buildVendorResetEmailHtml({
      ownerName,
      businessName,
      otp,
    }),
    text: buildVendorResetEmailText({
      ownerName,
      businessName,
      otp,
    }),
    tags: [
      {
        name: "source",
        value: "vendor_password_reset",
      },
    ],
  });
}

module.exports = {
  sendVendorPasswordResetOtpEmail,
};
