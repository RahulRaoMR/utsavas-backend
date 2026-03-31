function formatCurrency(value, suffix) {
  const amount = Number(value) || 0;

  if (amount <= 0) {
    return "";
  }

  return `Rs ${amount.toLocaleString("en-IN")}${suffix ? ` ${suffix}` : ""}`;
}

function buildPricingReply(hall) {
  const pricing = [
    formatCurrency(hall?.pricePerEvent, "per event"),
    formatCurrency(hall?.pricePerDay, "per day"),
    formatCurrency(hall?.pricePerPlate, "per plate"),
  ].filter(Boolean);

  if (!pricing.length) {
    return "Pricing depends on your event type, guest count, and selected services. Share your budget and guest count, and we will help with the best package.";
  }

  if (pricing.length === 1) {
    return `The current starting price for ${hall?.hallName || "this venue"} is ${pricing[0]}. Share your event size for an exact quote.`;
  }

  return `Here are the current pricing options for ${hall?.hallName || "this venue"}: ${pricing.join(", ")}. Share your event details and we will guide you to the best fit.`;
}

const BOT_RULES = [
  {
    keywords: ["price", "cost", "budget", "package", "rate", "charges"],
    reply: ({ hall }) => buildPricingReply(hall),
  },
  {
    keywords: ["availability", "available", "date", "booking", "book"],
    reply: ({ hall }) =>
      `${hall?.hallName || "This venue"} is checked live against the venue calendar. Please share your event date and guest count, and we will confirm the best availability for you.`,
  },
  {
    keywords: ["location", "address", "where", "map", "area", "pincode"],
    reply: ({ hall }) =>
      `The venue is located in ${hall?.address?.area || "the listed venue area"}, ${hall?.address?.city || "the selected city"}. You can also use the map section on this page for exact directions.`,
  },
  {
    keywords: ["phone", "call", "contact", "number"],
    reply: () =>
      "You can use the phone number button on this page for direct contact. If you prefer, continue here and we will help you with your query first.",
  },
  {
    keywords: ["capacity", "guest", "people", "crowd"],
    reply: ({ hall }) =>
      `${hall?.hallName || "This venue"} can host around ${Number(hall?.capacity) || "the listed"} guests. Share your expected guest count and event type for a better recommendation.`,
  },
];

function getBotReply({ hall, messageText }) {
  const normalizedMessage = String(messageText || "").toLowerCase();
  const matchedRule = BOT_RULES.find((rule) =>
    rule.keywords.some((keyword) => normalizedMessage.includes(keyword))
  );

  if (matchedRule) {
    return matchedRule.reply({ hall });
  }

  return `Thanks for messaging ${hall?.hallName || "this venue"}. The venue owner is away right now, but your lead is saved and the team will reply shortly. Meanwhile, you can share your event date, guest count, and budget here.`;
}

module.exports = {
  getBotReply,
};
