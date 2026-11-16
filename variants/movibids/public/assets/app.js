(function () {
  var cfg = window.SITE_CONFIG || {};
  var brand = cfg.brand || "MoviBids";
  var dict = window.I18N || {};
  var en = dict.en || (dict.en = {});
  var LANGS = { en: "en", ru: "ru", zh: "zh-CN" };

  function fill(s) { return String(s).split("{brand}").join(brand); }

  // Read English from the page so EN never needs a second copy.
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var k = el.getAttribute("data-i18n");
    if (!(k in en)) en[k] = el.textContent;
  });
  document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
    var k = el.getAttribute("data-i18n-html");
    if (!(k in en)) en[k] = el.innerHTML;
  });
  document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
    el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
      var p = pair.split(":"), attr = p[0], k = p[1];
      if (k && !(k in en)) en[k] = el.getAttribute(attr) || "";
    });
  });

  var current = "en";
  function t(k) {
    var d = dict[current] || {};
    return fill(k in d ? d[k] : (k in en ? en[k] : k));
  }

  function apply(lang) {
    if (!dict[lang] && lang !== "en") lang = "en";
    current = lang;
    document.documentElement.lang = LANGS[lang] || lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        if (p[1]) el.setAttribute(p[0], t(p[1]));
      });
    });
    document.querySelectorAll("[data-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === lang ? "true" : "false");
    });
    document.querySelectorAll("[data-legal]").forEach(function (el) {
      el.textContent = cfg.legalEntity ? t("foot.operator") + " " + cfg.legalEntity : "";
    });
    document.querySelectorAll("[data-disabled-message]").forEach(function (el) {
      el.textContent = t("msg.disabled");
    });
    try { localStorage.setItem("site-lang", lang); } catch (e) {}
  }

  function pickLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q && (dict[q] || q === "en")) return q;
    try { var s = localStorage.getItem("site-lang"); if (s) return s; } catch (e) {}
    if (cfg.defaultLang && (dict[cfg.defaultLang] || cfg.defaultLang === "en")) return cfg.defaultLang;
    var n = (navigator.language || "").toLowerCase();
    if (n.indexOf("ru") === 0) return "ru";
    if (n.indexOf("zh") === 0) return "zh";
    return "en";
  }

  document.querySelectorAll("[data-brand]").forEach(function (el) { el.textContent = brand; });
  document.querySelectorAll("[data-contact-email]").forEach(function (el) {
    if (cfg.contactEmail) { el.textContent = cfg.contactEmail; el.href = "mailto:" + cfg.contactEmail; } else { el.hidden = true; }
  });
  document.querySelectorAll("[data-telegram]").forEach(function (el) {
    if (cfg.telegram) { el.href = cfg.telegram; el.hidden = false; }
  });
  if (cfg.formsEnabled === false) {
    document.querySelectorAll('a[href="privacy.html"]').forEach(function (el) { el.hidden = true; });
  }
  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () { apply(b.getAttribute("data-lang")); });
  });
  apply(pickLang());

  // Forms
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  document.querySelectorAll("form[data-form]").forEach(function (form) {
    var status = form.querySelector(".form-status");
    var errBox = form.querySelector("[data-error]");
    var btn = form.querySelector('button[type="submit"]');

    if (cfg.formsEnabled === false) {
      form.querySelectorAll(".fields, .consent, .field-error, button[type=submit]").forEach(function (el) {
        el.hidden = true;
      });
      status.setAttribute("data-disabled-message", "");
      status.textContent = t("msg.disabled");
      status.className = "form-status ok";
      return;
    }

    form.addEventListener("input", function () { errBox.textContent = ""; });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      status.className = "form-status";
      errBox.textContent = "";

      var missing = Array.prototype.filter.call(form.querySelectorAll("[required]"), function (el) {
        return el.type === "checkbox" ? false : !el.value.trim();
      });
      if (missing.length) { errBox.textContent = t("msg.required"); missing[0].focus(); return; }
      var email = form.querySelector('[type="email"]');
      if (email && !emailRe.test(email.value.trim())) { errBox.textContent = t("msg.email"); email.focus(); return; }
      var consent = form.querySelector('[name="consent"]');
      if (consent && !consent.checked) { errBox.textContent = t("msg.consent"); consent.focus(); return; }

      var fields = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.type === "submit") return;
        fields[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
      });
      var payload = { type: form.getAttribute("data-form"), lang: current, page: location.href, fields: fields };

      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = t("msg.sending");

      fetch(cfg.apiEndpoint || "/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        status.textContent = t("msg.ok");
        status.className = "form-status ok";
        form.reset();
      }).catch(function () {
        status.textContent = t("msg.err") + (cfg.contactEmail ? " " + cfg.contactEmail : "");
        status.className = "form-status err";
      }).then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
    });
  });
})();
