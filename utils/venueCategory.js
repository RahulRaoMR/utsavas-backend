function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function slugifyCategory(value) {
  return normalizeText(value)
    .replace(/&/g, " and ")
    .replace(/[/,]+/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const LEGACY_CATEGORY_ALIASES = {
  banquet: "banquet-halls",
  banquethall: "banquet-halls",
  "banquet hall": "banquet-halls",
  "banquet halls": "banquet-halls",
  weddinghall: "wedding",
  "wedding hall": "wedding",
  "premium venue": "premium-venues",
  "premium venues": "premium-venues",
  resort: "resorts",
  "farm house": "farm-houses",
  "farm houses": "farm-houses",
  "convention hall": "convention-halls",
  "convention halls": "convention-halls",
  "kalyana mandapam": "kalyana-mandapams",
  "kalyana mandapams": "kalyana-mandapams",
  "destination wedding": "destination-weddings",
  "destination wedding hall": "destination-weddings",
  "destination weddings": "destination-weddings",
  lawn: "lawns",
  lawns: "lawns",
  "5 star hotel": "5-star-hotels",
  "5 star hotels": "5-star-hotels",
  "4 star hotel": "4-star-hotels",
  "4 star hotels": "4-star-hotels",
  "mini hall": "mini-halls",
  "mini halls": "mini-halls",
  "fort and palace": "fort-and-palaces",
  "fort and palaces": "fort-and-palaces",
  "party venue": "party",
  "party venues": "party",
};

const CATEGORY_ALIASES = {
  ...LEGACY_CATEGORY_ALIASES,
  "premium-venues": "premium-venues",
  resorts: "resorts",
  "banquet-halls": "banquet-halls",
  "farm-houses": "farm-houses",
  "convention-halls": "convention-halls",
  "kalyana-mandapams": "kalyana-mandapams",
  "destination-weddings": "destination-weddings",
  lawns: "lawns",
  "5-star-hotels": "5-star-hotels",
  "4-star-hotels": "4-star-hotels",
  "mini-halls": "mini-halls",
  "fort-and-palaces": "fort-and-palaces",
  wedding: "wedding",
  party: "party",
};

function normalizeVenueCategory(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "";
  }

  const slugified = slugifyCategory(normalized);

  return (
    CATEGORY_ALIASES[normalized] ||
    CATEGORY_ALIASES[slugified] ||
    slugified
  );
}

module.exports = {
  normalizeVenueCategory,
};
