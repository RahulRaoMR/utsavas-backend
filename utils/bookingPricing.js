const BOOKING_GST_RATE = 0.18;
const BOOKING_GST_HSN_CODE = "998599";

function toSafeAmount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(numericValue, 0) : 0;
}

function getBookingGstRate(value, fallback = BOOKING_GST_RATE) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function calculateBookingInvoiceBreakdown({
  venueAmount = 0,
  discountAmount = 0,
  gstRate = BOOKING_GST_RATE,
} = {}) {
  const normalizedVenueAmount = toSafeAmount(venueAmount);
  const normalizedDiscountAmount = Math.min(
    toSafeAmount(discountAmount),
    normalizedVenueAmount
  );
  const normalizedGstRate = getBookingGstRate(gstRate);
  const taxableAmount = Math.max(
    normalizedVenueAmount - normalizedDiscountAmount,
    0
  );
  const gstAmount =
    taxableAmount > 0 ? Math.round(taxableAmount * normalizedGstRate) : 0;
  const totalAmount = taxableAmount + gstAmount;

  return {
    venueAmount: normalizedVenueAmount,
    discountAmount: normalizedDiscountAmount,
    taxableAmount,
    gstRate: normalizedGstRate,
    gstAmount,
    totalAmount,
    gstHsnCode: BOOKING_GST_HSN_CODE,
  };
}

module.exports = {
  BOOKING_GST_RATE,
  BOOKING_GST_HSN_CODE,
  calculateBookingInvoiceBreakdown,
  getBookingGstRate,
};
