const axios = require("axios");

const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";

const normalizePhoneForStorage = (phone) => {
  if (!phone) return phone;

  let digits = phone.toString().replace(/\D/g, "");

  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  return digits;
};

const normalizePhoneForSms = (phone) => {
  const digits = phone?.toString().replace(/\D/g, "") || "";

  if (digits.length === 10) {
    return digits;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  throw new Error("Phone number must be a valid 10-digit Indian mobile number");
};

const getProviderMessage = (data) => {
  if (Array.isArray(data?.message)) {
    return data.message.join(", ");
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  return "SMS provider rejected the request";
};

const buildProviderError = (data, fallbackMessage) => {
  const message = getProviderMessage(data) || fallbackMessage;
  const statusCode = data?.status_code;
  const error = new Error(
    statusCode ? `${message} (Fast2SMS ${statusCode})` : message
  );
  error.providerResponse = data;
  return error;
};

const resolveFast2SmsRoute = () => {
  const route = process.env.FAST2SMS_ROUTE?.trim().toLowerCase();

  if (
    route === "otp" ||
    route === "q" ||
    route === "dlt" ||
    route === "dlt_manual"
  ) {
    return route;
  }

  return "q";
};

const renderTemplate = (template, values) => {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    values[key] == null ? "" : String(values[key])
  );
};

const buildQuickMessage = (otp) => {
  const template =
    process.env.FAST2SMS_MESSAGE_TEMPLATE?.trim() ||
    "Your UTSAVAS OTP is {{otp}}";

  return renderTemplate(template, { otp });
};

const requireEnvValue = (name, route) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required when FAST2SMS_ROUTE=${route}`);
  }

  return value;
};

const buildDltVariablesValues = (otp) => {
  const template =
    process.env.FAST2SMS_DLT_VARIABLES_TEMPLATE?.trim() || "{{otp}}";

  return renderTemplate(template, { otp });
};

const buildDltManualMessage = (otp) => {
  const template =
    process.env.FAST2SMS_DLT_MANUAL_MESSAGE_TEMPLATE?.trim() ||
    "Your UTSAVAS OTP is {{otp}}";

  return renderTemplate(template, { otp });
};

const buildPayload = ({ route, phone, otp }) => {
  const payload = new URLSearchParams({
    route,
    numbers: normalizePhoneForSms(phone),
  });

  if (route === "otp") {
    payload.set("variables_values", String(otp));
    return payload;
  }

  if (route === "q") {
    payload.set("language", "english");
    payload.set("message", buildQuickMessage(otp));
    return payload;
  }

  if (route === "dlt") {
    payload.set("sender_id", requireEnvValue("FAST2SMS_DLT_SENDER_ID", route));
    payload.set("message", requireEnvValue("FAST2SMS_DLT_MESSAGE_ID", route));

    const variablesValues = buildDltVariablesValues(otp);
    if (variablesValues) {
      payload.set("variables_values", variablesValues);
    }

    return payload;
  }

  if (route === "dlt_manual") {
    payload.set("sender_id", requireEnvValue("FAST2SMS_DLT_SENDER_ID", route));
    payload.set(
      "template_id",
      requireEnvValue("FAST2SMS_DLT_TEMPLATE_ID", route)
    );
    payload.set("entity_id", requireEnvValue("FAST2SMS_DLT_ENTITY_ID", route));
    payload.set("message", buildDltManualMessage(otp));
    return payload;
  }

  throw new Error(`Unsupported FAST2SMS_ROUTE=${route}`);
};

const sendFast2SmsOtp = async ({ phone, otp }) => {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY is missing");
  }

  const route = resolveFast2SmsRoute();
  const payload = buildPayload({ route, phone, otp });

  try {
    const response = await axios.post(FAST2SMS_URL, payload.toString(), {
      headers: {
        authorization: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    });

    if (!response.data?.return) {
      throw buildProviderError(
        response.data,
        "SMS provider rejected the request"
      );
    }

    return response.data;
  } catch (error) {
    if (error.providerResponse) {
      throw error;
    }

    if (error.response?.data) {
      throw buildProviderError(
        error.response.data,
        error.message || "SMS request failed"
      );
    }

    throw error;
  }
};

module.exports = {
  normalizePhoneForStorage,
  normalizePhoneForSms,
  sendFast2SmsOtp,
};
