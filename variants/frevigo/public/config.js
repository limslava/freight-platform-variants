// Single place to rename the brand and set contacts.
// This standalone variant uses the FreVigo brand.
window.SITE_CONFIG = {
  brand: "FreVigo",
  // Legal entity shown in the footer and privacy policy (fill before launch)
  legalEntity: "",
  contactEmail: "",
  telegram: "",               // e.g. "https://t.me/your_channel" — leave empty to hide
  apiEndpoint: "/api/lead",   // where the forms send leads (server/server.js)
  formsEnabled: false,         // enable only after legal/contact details are ready
  // Russian by default on .pro; English by default on .com.
  defaultLang: /\.pro$/i.test(window.location.hostname) ? "ru" : "en"
};
