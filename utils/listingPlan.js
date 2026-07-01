const LISTING_PLANS = [
  {
    value: "basic",
    name: "Basic Listing",
    badge: "Entry Plan",
    price: "\u20B91,000",
    amountValue: 1000,
    billingCycleMonths: 3,
    bestFor: "Small halls, new properties",
    validity: "Validity: 3 months",
    features: [
      "1 property listing",
      "Photos upload",
      "Contact number visible",
      "Appears in normal search",
      "Chat with customers (in-app chat support)",
      "Social media promotion (1 post)",
    ],
    note: "Goal: Bring maximum properties onto the platform",
    priority: 1,
  },
  {
    value: "featured",
    name: "Featured Listing",
    badge: "Standard Plan",
    price: "\u20B93,999 per property / year",
    amountValue: 3999,
    billingCycleMonths: 12,
    bestFor: "All halls",
    validity: "Validity: 1 year",
    features: [
      "Appears in normal search",
      "Highlighted listing badge",
      "Contact number visible",
      "Photos upload",
      "Chat with customers (in-app chat support)",
      "Social media promotion (1 post)",
      "Analytics (views, enquiries)",
    ],
    note:
      "Goal: Increase visibility, generate more enquiries, and help properties grow their bookings",
    priority: 2,
  },
  {
    value: "premium",
    name: "Premium / Exclusive Listing",
    badge: "Pro Plan",
    price: "\u20B99,999 per property / year",
    amountValue: 9999,
    billingCycleMonths: 12,
    bestFor: "Premium wedding venues, resorts, convention halls",
    validity: "Validity - 1 year",
    features: [
      "Top placement on homepage",
      "Photos upload",
      "Chat with customers (in-app chat support)",
      "Social media promotion (1 post)",
      "Analytics (views, enquiries)",
      "Dedicated relationship manager",
      "Google Ads promotion",
      "Instagram promotion",
      "Featured tag + verified badge",
      "Priority customer support",
    ],
    note:
      "Goal: Maximize visibility, attract premium customers, and drive high-value bookings with strong brand positioning",
    priority: 3,
  },
  {
    value: "digital-presence",
    name: "Digital Presence Plan",
    badge: "Digital Plan",
    price: "\u20B921,000 / year",
    amountValue: 21000,
    billingCycleMonths: 12,
    bestFor: "Venues that want listing priority plus a full digital package",
    validity: "Validity: 1 year",
    features: [
      "Featured listing on Utsavas",
      "Premium placement in search",
      "Website for the venue",
      "Domain + Hosting (1 year)",
      "Google My Business setup",
      "Google Maps location pin setup",
      "Chat with customers (in-app chat support)",
      "Photo gallery setup",
      "Contact form",
      "Basic SEO setup",
      "Social media page setup",
      "Analytics report",
      "Verified venue badge",
      "Dedicated support",
    ],
    note:
      "Goal: Build a strong online presence, increase discoverability, and generate consistent enquiries through a complete digital ecosystem",
    priority: 4,
  },
];

const LISTING_PLAN_VALUES = LISTING_PLANS.map((plan) => plan.value);

const PLAN_ALIAS_LOOKUP = LISTING_PLANS.reduce((lookup, plan) => {
  const aliases = [
    plan.value,
    plan.name,
    plan.badge,
    plan.name.replace(/[^\w\s]/g, " "),
    `${plan.value} listing`,
  ];

  aliases.forEach((alias) => {
    lookup[normalizeText(alias)] = plan.value;
  });

  return lookup;
}, {});

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeListingPlan(value) {
  const normalized = normalizeText(value);
  return PLAN_ALIAS_LOOKUP[normalized] || "basic";
}

function getListingPlanDetails(value) {
  const normalized = normalizeListingPlan(value);
  return LISTING_PLANS.find((plan) => plan.value === normalized) || LISTING_PLANS[0];
}

function getListingPlanPriority(value) {
  return getListingPlanDetails(value).priority;
}

function getListingPlanMonthlyCost(value) {
  const details = getListingPlanDetails(value);
  const totalAmount = Number(details?.amountValue) || 0;
  const billingCycleMonths = Number(details?.billingCycleMonths) || 1;

  return billingCycleMonths > 0 ? totalAmount / billingCycleMonths : totalAmount;
}

function getHallListingPriority(hall) {
  const explicitPriority = Number(hall?.listingPriority);

  if (Number.isFinite(explicitPriority) && explicitPriority > 0) {
    return explicitPriority;
  }

  return getListingPlanPriority(hall?.listingPlan);
}

function getHallCreatedAtValue(hall) {
  const timestamp = new Date(hall?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortHallsByListingPriority(halls) {
  return [...(Array.isArray(halls) ? halls : [])].sort((left, right) => {
    const priorityDifference =
      getHallListingPriority(right) - getHallListingPriority(left);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return getHallCreatedAtValue(right) - getHallCreatedAtValue(left);
  });
}

module.exports = {
  LISTING_PLANS,
  LISTING_PLAN_VALUES,
  getListingPlanDetails,
  getListingPlanMonthlyCost,
  getListingPlanPriority,
  normalizeListingPlan,
  sortHallsByListingPriority,
};
