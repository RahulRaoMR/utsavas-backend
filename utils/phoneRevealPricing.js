const FREE_PHONE_REVEAL_LIMIT = 2;
const PHONE_REVEAL_UNLOCK_BASE_AMOUNT = 500;
const PHONE_REVEAL_GST_RATE = 0.18;
const PHONE_REVEAL_CURRENCY = "INR";

const roundCurrency = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

function getPhoneRevealPricing(
  baseAmount = PHONE_REVEAL_UNLOCK_BASE_AMOUNT,
  gstRate = PHONE_REVEAL_GST_RATE
) {
  const normalizedBaseAmount = roundCurrency(baseAmount);
  const normalizedGstRate = Number(gstRate) > 0 ? Number(gstRate) : PHONE_REVEAL_GST_RATE;
  const gstAmount = roundCurrency(normalizedBaseAmount * normalizedGstRate);
  const totalAmount = roundCurrency(normalizedBaseAmount + gstAmount);

  return {
    baseAmount: normalizedBaseAmount,
    gstRate: normalizedGstRate,
    gstAmount,
    totalAmount,
    currency: PHONE_REVEAL_CURRENCY,
  };
}

module.exports = {
  FREE_PHONE_REVEAL_LIMIT,
  PHONE_REVEAL_UNLOCK_BASE_AMOUNT,
  PHONE_REVEAL_GST_RATE,
  PHONE_REVEAL_CURRENCY,
  getPhoneRevealPricing,
};
