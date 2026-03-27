const axios = require("axios");
const nodemailer = require("nodemailer");

let cachedTransporter = null;
let cachedResendConfig = null;
const SIMPLE_EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function buildMailConfigError() {
  const error = new Error(
    "Email is not configured. Set either RESEND_API_KEY with RESEND_FROM_EMAIL, or SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS."
  );
  error.code = "MAIL_NOT_CONFIGURED";
  return error;
}

function stripWrappingQuotes(value) {
  let normalizedValue = String(value || "").trim();

  while (
    normalizedValue.length >= 2 &&
    ((normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) ||
      (normalizedValue.startsWith("'") && normalizedValue.endsWith("'")))
  ) {
    normalizedValue = normalizedValue.slice(1, -1).trim();
  }

  return normalizedValue;
}

function normalizeMailbox(value) {
  const normalizedValue = stripWrappingQuotes(value).replace(/\s+/g, " ").trim();

  if (!normalizedValue) {
    return "";
  }

  if (SIMPLE_EMAIL_REGEX.test(normalizedValue)) {
    return normalizedValue.toLowerCase();
  }

  const displayMatch = normalizedValue.match(
    /^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+\.[^<>\s]+)\s*>$/
  );

  if (displayMatch) {
    const displayName = stripWrappingQuotes(displayMatch[1]).replace(/\s+/g, " ").trim();
    const email = displayMatch[2].trim().toLowerCase();

    return displayName ? `${displayName} <${email}>` : email;
  }

  const embeddedEmailMatch = normalizedValue.match(
    /([^<>\s]+@[^<>\s]+\.[^<>\s]+)/
  );

  if (embeddedEmailMatch) {
    const email = embeddedEmailMatch[1].trim().toLowerCase();
    const displayName = stripWrappingQuotes(
      normalizedValue
        .replace(embeddedEmailMatch[1], "")
        .replace(/[<>]/g, " ")
    )
      .replace(/\s+/g, " ")
      .trim();

    return displayName ? `${displayName} <${email}>` : email;
  }

  return "";
}

function formatCurrency(amount) {
  return `Rs ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatChargeLabel(rate) {
  return `GST (${Math.round(rate * 100)}%)`;
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function calculateDays(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
}

function buildAddress(address = {}) {
  return [
    address.flat,
    address.floor,
    address.area,
    address.city,
    address.state,
    address.pincode,
  ]
    .filter(Boolean)
    .join(", ");
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const smtpHost = pickEnv("SMTP_HOST", "MAIL_HOST", "EMAIL_HOST");
  const smtpPort = pickEnv("SMTP_PORT", "MAIL_PORT", "EMAIL_PORT");
  const smtpUser = pickEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
  const smtpSecure = pickEnv("SMTP_SECURE", "MAIL_SECURE", "EMAIL_SECURE");
  const normalizedPass = pickEnv("SMTP_PASS", "MAIL_PASS", "EMAIL_PASS").replace(
    /\s+/g,
    ""
  );

  if (!smtpHost || !smtpPort || !smtpUser || !normalizedPass) {
    throw buildMailConfigError();
  }

  if (
    String(smtpHost).toLowerCase() === "smtp.gmail.com" &&
    (normalizedPass === "YOUR_GOOGLE_APP_PASSWORD" || normalizedPass.length < 16)
  ) {
    throw new Error(
      "Gmail SMTP needs a valid 16-character Google App Password in SMTP_PASS. Your normal Gmail password will not work."
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: String(smtpSecure).toLowerCase() === "true" || Number(smtpPort) === 465,
    auth: {
      user: smtpUser,
      pass: normalizedPass,
    },
  });

  return cachedTransporter;
}

function getResendConfig() {
  if (cachedResendConfig) {
    return cachedResendConfig;
  }

  const apiKey = pickEnv("RESEND_API_KEY");
  const from = normalizeMailbox(
    pickEnv(
      "RESEND_FROM_EMAIL",
      "RESEND_FROM",
      "MAIL_FROM",
      "EMAIL_FROM",
      "SMTP_FROM"
    )
  );
  const replyTo = normalizeMailbox(
    pickEnv("RESEND_REPLY_TO", "MAIL_REPLY_TO", "EMAIL_REPLY_TO")
  );

  if (!apiKey || !from) {
    return null;
  }

  cachedResendConfig = {
    apiKey,
    from,
    replyTo,
  };

  return cachedResendConfig;
}

function hasSmtpConfig() {
  const smtpHost = pickEnv("SMTP_HOST", "MAIL_HOST", "EMAIL_HOST");
  const smtpPort = pickEnv("SMTP_PORT", "MAIL_PORT", "EMAIL_PORT");
  const smtpUser = pickEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
  const smtpPass = pickEnv("SMTP_PASS", "MAIL_PASS", "EMAIL_PASS");

  return Boolean(smtpHost && smtpPort && smtpUser && smtpPass);
}

function getMailErrorMessage(error) {
  if (!error) {
    return "Confirmation email could not be sent right now.";
  }

  if (error.code === "MAIL_NOT_CONFIGURED") {
    return "Confirmation email is temporarily unavailable.";
  }

  if (error.code === "EAUTH" || error.responseCode === 535) {
    return "Confirmation email service is unavailable right now.";
  }

  return "Confirmation email could not be sent right now.";
}

function buildMailData(booking) {
  const hall = booking.hall || {};
  const vendor = booking.vendor || {};
  const bookingUrl = process.env.PUBLIC_WEB_URL || "https://www.utsavas.com";
  const gstRate = 0.02;
  const hallName = hall.hallName || "Your venue";
  const venueAddress = buildAddress(hall.address || {});
  const totalAmount = Number(booking.amount) || 0;
  const venueAmount = Number(booking.venueAmount) || totalAmount;
  const gstAmount = Number(booking.supportFee) || 0;
  const subtotalAmount = Number(booking.subtotalAmount) || venueAmount + gstAmount;
  const discountAmount = Number(booking.discountAmount) || 0;
  const days = calculateDays(booking.checkIn, booking.checkOut);

  return {
    bookingReference: String(booking._id),
    bookingUrl,
    hallName,
    venueAddress: venueAddress || "Venue address will be shared by the venue partner.",
    vendorName: vendor.businessName || "UTSAVAS Venue Partner",
    vendorPhone: vendor.phone || "Available from your venue partner after confirmation",
    vendorEmail: vendor.email || "support@utsavas.com",
    customerName: booking.customerName || "Guest",
    customerEmail: booking.customerEmail,
    eventType: booking.eventType || "Event",
    guests: booking.guests || 0,
    checkIn: formatDate(booking.checkIn),
    checkOut: formatDate(booking.checkOut),
    days,
    paymentMethod:
      booking.paymentMethod === "online" ? "Paid online" : "Pay at venue",
    paymentStatus: booking.paymentStatus || "pending",
    gstLabel: formatChargeLabel(gstRate),
    pricingBasis: booking.pricingBasis || "Venue pricing",
    venueAmount: formatCurrency(venueAmount),
    gstAmount: formatCurrency(gstAmount),
    subtotalAmount: formatCurrency(subtotalAmount),
    discountAmount: formatCurrency(discountAmount),
    totalAmount: formatCurrency(totalAmount),
    couponCode: booking.couponCode || "No coupon applied",
  };
}

function buildHtml(data) {
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; background:#f5f7fb; padding:32px; color:#183b63;">
      <div style="max-width:760px; margin:0 auto; background:#fffaf1; border-radius:24px; overflow:hidden; border:1px solid #dfe8f6;">
        <div style="background:linear-gradient(135deg,#5f97d6,#3f6fb6); color:#ffffff; padding:28px 32px;">
          <div style="font-size:13px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.86;">UTSAVAS Confirmation</div>
          <h1 style="margin:12px 0 8px; font-size:32px; line-height:1.2;">Your booking is confirmed at ${data.hallName}</h1>
          <p style="margin:0; font-size:16px; line-height:1.7;">Thanks ${data.customerName}. Your venue partner has approved the booking request.</p>
        </div>

        <div style="padding:32px;">
          <p style="margin:0 0 18px; color:#5e5551; font-size:16px; line-height:1.8;">
            Booking reference: <strong style="color:#183b63;">${data.bookingReference}</strong>
          </p>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px;">
            <div style="background:#ffffff; border:1px solid #dfe8f6; border-radius:18px; padding:18px;">
              <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.06em; color:#7c6a52; margin-bottom:8px;">Check-in</div>
              <div style="font-size:20px; color:#183b63; font-weight:700;">${data.checkIn}</div>
            </div>
            <div style="background:#ffffff; border:1px solid #dfe8f6; border-radius:18px; padding:18px;">
              <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.06em; color:#7c6a52; margin-bottom:8px;">Check-out</div>
              <div style="font-size:20px; color:#183b63; font-weight:700;">${data.checkOut}</div>
            </div>
          </div>

          <div style="background:#ffffff; border:1px solid #dfe8f6; border-radius:20px; padding:22px; margin-bottom:22px;">
            <h2 style="margin:0 0 16px; color:#183b63; font-size:24px;">Reservation details</h2>
            <table style="width:100%; border-collapse:collapse; font-size:16px; line-height:1.7;">
              <tr><td style="padding:6px 0; color:#7c6a52;">Venue</td><td style="padding:6px 0; color:#183b63; font-weight:700;">${data.hallName}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Location</td><td style="padding:6px 0; color:#183b63;">${data.venueAddress}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Event</td><td style="padding:6px 0; color:#183b63;">${data.eventType}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Guests</td><td style="padding:6px 0; color:#183b63;">${data.guests}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Duration</td><td style="padding:6px 0; color:#183b63;">${data.days} day${data.days > 1 ? "s" : ""}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Pricing basis</td><td style="padding:6px 0; color:#183b63;">${data.pricingBasis}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Venue partner</td><td style="padding:6px 0; color:#183b63;">${data.vendorName}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Partner phone</td><td style="padding:6px 0; color:#183b63;">${data.vendorPhone}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Partner email</td><td style="padding:6px 0; color:#183b63;">${data.vendorEmail}</td></tr>
              <tr><td style="padding:6px 0; color:#7c6a52;">Payment</td><td style="padding:6px 0; color:#183b63;">${data.paymentMethod} (${data.paymentStatus})</td></tr>
            </table>
          </div>

          <div style="background:#ffffff; border:1px solid #dfe8f6; border-radius:20px; padding:22px; margin-bottom:22px;">
            <h2 style="margin:0 0 16px; color:#183b63; font-size:24px;">Invoice summary</h2>
            <table style="width:100%; border-collapse:collapse; font-size:16px; line-height:1.8;">
              <tr><td style="padding:8px 0; color:#5e5551;">Venue amount</td><td style="padding:8px 0; color:#183b63; font-weight:700; text-align:right;">${data.venueAmount}</td></tr>
              <tr><td style="padding:8px 0; color:#5e5551;">${data.gstLabel}</td><td style="padding:8px 0; color:#183b63; font-weight:700; text-align:right;">${data.gstAmount}</td></tr>
              <tr><td style="padding:8px 0; color:#5e5551;">Subtotal</td><td style="padding:8px 0; color:#183b63; font-weight:700; text-align:right;">${data.subtotalAmount}</td></tr>
              <tr><td style="padding:8px 0; color:#5e5551;">Coupon</td><td style="padding:8px 0; color:#183b63; font-weight:700; text-align:right;">${data.couponCode}</td></tr>
              <tr><td style="padding:8px 0; color:#2f855a;">Discount</td><td style="padding:8px 0; color:#2f855a; font-weight:700; text-align:right;">- ${data.discountAmount}</td></tr>
              <tr><td style="padding:12px 0 0; color:#183b63; font-size:20px; font-weight:700;">Total</td><td style="padding:12px 0 0; color:#183b63; font-size:20px; font-weight:700; text-align:right;">${data.totalAmount}</td></tr>
            </table>
          </div>

          <div style="background:#edf4ff; border:1px solid #d2e3fb; border-radius:18px; padding:18px; color:#30402f; line-height:1.8;">
            <strong style="display:block; color:#183b63; margin-bottom:8px;">Need help?</strong>
            Your booking is now confirmed. If you need any changes, please contact the venue partner or visit UTSAVAS support at
            <a href="${data.bookingUrl}" style="color:#3f6fb6; text-decoration:none;"> ${data.bookingUrl}</a>.
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildText(data) {
  return [
    `UTSAVAS booking confirmed: ${data.hallName}`,
    ``,
    `Hello ${data.customerName},`,
    `Your booking is confirmed by the venue partner.`,
    ``,
    `Booking reference: ${data.bookingReference}`,
    `Venue: ${data.hallName}`,
    `Location: ${data.venueAddress}`,
    `Check-in: ${data.checkIn}`,
    `Check-out: ${data.checkOut}`,
    `Event: ${data.eventType}`,
    `Guests: ${data.guests}`,
    `Duration: ${data.days} day${data.days > 1 ? "s" : ""}`,
    `Pricing basis: ${data.pricingBasis}`,
    `Payment: ${data.paymentMethod} (${data.paymentStatus})`,
    ``,
    `Invoice summary`,
    `Venue amount: ${data.venueAmount}`,
    `${data.gstLabel}: ${data.gstAmount}`,
    `Subtotal: ${data.subtotalAmount}`,
    `Coupon: ${data.couponCode}`,
    `Discount: - ${data.discountAmount}`,
    `Total: ${data.totalAmount}`,
    ``,
    `Venue partner: ${data.vendorName}`,
    `Phone: ${data.vendorPhone}`,
    `Email: ${data.vendorEmail}`,
    ``,
    `UTSAVAS`,
    `${data.bookingUrl}`,
  ].join("\n");
}

async function sendViaResend(mailData, html, text, resendConfig) {
  const payload = {
    from: resendConfig.from,
    to: [mailData.customerEmail],
    subject: `Your UTSAVAS booking is confirmed at ${mailData.hallName}`,
    html,
    text,
    attachments: [
      {
        filename: `UTSAVAS-Invoice-${mailData.bookingReference}.html`,
        content: Buffer.from(html, "utf8").toString("base64"),
      },
    ],
    tags: [
      { name: "source", value: "booking_approval" },
      {
        name: "booking_id",
        value: mailData.bookingReference.replace(/[^a-zA-Z0-9_-]/g, ""),
      },
    ],
  };

  if (resendConfig.replyTo) {
    payload.reply_to = resendConfig.replyTo;
  }

  const response = await axios.post("https://api.resend.com/emails", payload, {
    headers: {
      Authorization: `Bearer ${resendConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 20000,
  });

  return response.data;
}

async function sendViaSmtp(mailData, html, text) {
  const transporter = getTransporter();
  const smtpUser = pickEnv("SMTP_USER", "MAIL_USER", "EMAIL_USER");
  const fromAddress =
    normalizeMailbox(pickEnv("MAIL_FROM", "EMAIL_FROM", "SMTP_FROM")) ||
    `"UTSAVAS" <${smtpUser}>`;

  return transporter.sendMail({
    from: fromAddress,
    to: mailData.customerEmail,
    subject: `Your UTSAVAS booking is confirmed at ${mailData.hallName}`,
    html,
    text,
    attachments: [
      {
        filename: `UTSAVAS-Invoice-${mailData.bookingReference}.html`,
        content: html,
        contentType: "text/html; charset=utf-8",
      },
    ],
  });
}

async function sendBookingApprovalEmail(booking) {
  if (!booking?.customerEmail) {
    throw new Error("Customer email is missing for this booking.");
  }

  const mailData = buildMailData(booking);
  const html = buildHtml(mailData);
  const text = buildText(mailData);
  const resendConfig = getResendConfig();
  let resendError = null;

  if (resendConfig) {
    try {
      return await sendViaResend(mailData, html, text, resendConfig);
    } catch (error) {
      resendError = error;
      console.error("RESEND BOOKING EMAIL ERROR", error?.response?.data || error);
    }
  }

  if (hasSmtpConfig()) {
    try {
      return await sendViaSmtp(mailData, html, text);
    } catch (error) {
      console.error("SMTP BOOKING EMAIL ERROR", error);

      if (resendError) {
        const combinedError = new Error(
          `Resend failed and SMTP failed: ${error.message || "Unknown SMTP error"}`
        );
        combinedError.code = error.code || resendError.code;
        combinedError.responseCode = error.responseCode || resendError.responseCode;
        combinedError.resendError = resendError;
        combinedError.smtpError = error;
        throw combinedError;
      }

      throw error;
    }
  }

  if (resendError) {
    throw resendError;
  }

  throw buildMailConfigError();
}

module.exports = {
  getMailErrorMessage,
  sendBookingApprovalEmail,
};
