// Single place to rename the brand and set contacts.
// This standalone variant uses the FreVigo brand.
window.SITE_CONFIG = {
  brand: "FreVigo",
  // Legal entity shown in the footer and privacy policy (fill before launch)
  legalEntity: "[LEGAL ENTITY NAME, REG. NUMBER]",
  contactEmail: "[hello@your-domain.com]",
  telegram: "",               // e.g. "https://t.me/your_channel" — leave empty to hide
  apiEndpoint: "/api/lead",   // where the forms send leads (server/server.js)
  defaultLang: "en"           // en | ru | zh
};
