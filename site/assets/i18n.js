// Textos ES/EN. El español sale del propio HTML (salvo los pocos textos que no están en él); aquí vive el inglés.
// "Open-\u2060DTF": la unión de palabra (U+2060) evita que la marca se parta en dos líneas.
(function () {
  var EN = {
    "skip": "Skip to content", "nav.label": "Main", "slug": "Open-\u2060DTF · check print",
    "nav.how": "How it works", "nav.why": "Why", "nav.faq": "FAQ", "nav.download": "Download",
    "hero.tag": "Free Photoshop plugin · MIT license",
    "hero.t1": "DTF halftones", "hero.t2": "without paying for licenses.",
    "hero.sub": "Open-\u2060DTF turns your artwork into a halftone ready for DTF film: it removes the garment color, builds the dots and lets you tune everything live. Free, with the code in the open.",
    "hero.cta": "Download Open-\u2060DTF", "hero.code": "View the code",
    "hero.meta": "Photoshop 2022 (23.3) or later · works offline · no accounts",
    "demo.title": "Try it here: move the halftone", "demo.lpi": "Frequency", "demo.angle": "Angle", "demo.shape": "Shape", "demo.black": "Black", "demo.white": "White",
    "sh.round": "Round", "sh.line": "Line", "sh.diamond": "Diamond", "sh.ellipse": "Ellipse",
    "mini.size": "Print size", "mini.lock": "Proportions locked · 300 ppi", "mini.prep": "Prepare", "mini.same": "Same color",
    "mini.tones": "Tones", "mini.live": "Live", "mini.layer": "design - Prepped", "mini.apply": "Apply",
    "how.title": "From your artwork to the film, in five steps",
    "s1.t": "Open your artwork and pick the size",
    "s1.p": "Open the art in Photoshop. Open-\u2060DTF reads the canvas and suggests the print size at 300 ppi; change the width and the height follows in proportion.",
    "s2.t": "Pick the screen and press Prepare",
    "s2.p": "Round, line, diamond or ellipse; frequency in LPI and angle. Prepare duplicates your document and builds the screen with native Photoshop features. Your original is never touched.",
    "s3.t": "Remove the garment color",
    "s3.p": "Pick the color you don't want to print, such as the black of a black tee. It disappears, and the transitions into it become dots: no boxes or halos around the design.",
    "s4.t": "Tune it live",
    "s4.p": "Levels, shadow boost, frequency and angle update while you drag. Switch between the Original, Garment, Alpha and Mask views to check the result.",
    "s5.t": "Apply and export",
    "s5.p": "Apply creates a new document with a single transparent layer, cleaned of stray dots. Export it as PNG and send it to your RIP.",
    "why.title": "Preparing a DTF print shouldn't cost <em>a license every year.</em>",
    "why.lead": "Paid halftone plugins charge per seat or per subscription. Open-\u2060DTF does the same core job with tools you already have in Photoshop, and anyone can read, improve or adapt its code.",
    "f1.t": "Free, forever", "f1.d": "No subscriptions, no activations and no seat limits.",
    "f2.t": "Open source (MIT)", "f2.d": "Use it in your shop, modify it or fit it into your workflow. Just keep the license notice.",
    "f3.t": "Photoshop's own engine", "f3.d": "The screen comes from adjustment layers, pattern fills and native filters. No pixel processing in JavaScript.",
    "f4.t": "Non-destructive", "f4.d": "It works on a duplicate. Cancel leaves everything as it was.",
    "f5.t": "Offline", "f5.d": "The plugin requests no network access: it never sends your designs anywhere.",
    "f6.t": "Presets", "f6.d": "Save your settings per garment or ink and bring them back with one click.",
    "dl.title": "Download Open-\u2060DTF", "dl.latest": "Latest version", "dl.button": "Download .ccx", "dl.source": "Install from source",
    "dl.all": "All versions and release notes",
    "dl.none": "No version has been published yet. Meanwhile you can load the plugin from source with UXP Developer Tool.",
    "dl.req": "Requirements", "dl.reqp": "Adobe Photoshop 2022 (23.3) or later, on Windows or macOS.",
    "dl.inst": "Installation",
    "dl.i1": "Download the <code>.ccx</code> file.",
    "dl.i2": "Double-click it: Creative Cloud installs it and asks you to confirm, because it doesn't come from the Marketplace.",
    "dl.i3": "Open Photoshop and go to <code>Plugins › Open-\u2060DTF</code>.",
    "faq.title": "Frequently asked questions",
    "q1": "Is it really free?", "a1": "Yes. Open-\u2060DTF is released under the MIT license: use it in your business, install it on every machine and modify it without paying anything.",
    "q2": "Which Photoshop version do I need?", "a2": "Photoshop 2022 (23.3) or later. It's a UXP plugin, Adobe's current plugin system.",
    "q3": "Does it work on Mac?", "a3": "UXP plugins run on Windows and macOS, and the plugin uses nothing system-specific. So far it has been tested on Windows; if you use it on a Mac, tell us how it goes in the issues.",
    "q4": "Does it change my original file?", "a4": "No. Prepare works on a duplicate called “design - Prep”. Apply creates a new document “design - Prepped”. If you cancel, the duplicate is closed.",
    "q5": "Does it replace my RIP?", "a5": "No. Open-\u2060DTF prepares the image (screen, knockout and transparency). Ink management, the white underbase and printing are still your RIP's job.",
    "q6": "Which frequency (LPI) should I use?", "a6": "Start at 30 LPI, the default, and adjust for your printer and fabric: higher LPI gives finer dots; lower LPI gives bigger dots and a softer hand.",
    "q7": "Can I remove a color other than black?", "a7": "Yes. Knockout accepts any color: a red tee, a white background or anything you pick with Photoshop's eyedropper.",
    "q8": "Does it send my designs to a server?", "a8": "No. The plugin declares no network permissions, so Photoshop won't let it connect to the internet. Everything happens on your computer.",
    "q9": "I found a bug, what do I do?", "a9": "Open an <a href=\"https://github.com/eguiajosue/halftones-dtf/issues\" rel=\"noopener\">issue on GitHub</a> with your Photoshop version, the panel message and, if you can, a screenshot.",
    "ct.title": "Built in the open. Improve it with us.",
    "ct.repo": "Source code", "ct.issues": "Report a problem or suggest an idea", "ct.guide": "Contributing guide",
    "foot.l": "MIT license · Not affiliated with Adobe. Photoshop is a trademark of Adobe.",
    "foot.c": "3D model “<a href=\"https://sketchfab.com/3d-models/t-shirt-3d-model-free-408000a9975a4c34866b42dfaca4fa75\" rel=\"noopener\">T-SHIRT 3D Model Free</a>” by <a href=\"https://sketchfab.com/MohammadRajabloo\" rel=\"noopener\">Mohammad Rajabloo</a>, <a href=\"https://creativecommons.org/licenses/by/4.0/\" rel=\"noopener\">CC BY 4.0</a> license. Modified: repaired and simplified for the web."
  };

  // Textos en español que no aparecen en el HTML inicial
  var ES = { "dl.source": "Instalar desde el código" };
  var nodes = document.querySelectorAll("[data-i18n],[data-i18n-html]");
  nodes.forEach(function (el) {
    var k = el.getAttribute("data-i18n") || el.getAttribute("data-i18n-html");
    ES[k] = el.hasAttribute("data-i18n-html") ? el.innerHTML : el.textContent;
  });
  // Atributos traducibles: data-i18n-attr="aria-label:clave;title:otra"
  var attrNodes = document.querySelectorAll("[data-i18n-attr]");
  var eachAttr = function (el, fn) {
    el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
      var i = pair.indexOf(":");
      if (i > 0) fn(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    });
  };
  attrNodes.forEach(function (el) { eachAttr(el, function (attr, k) { ES[k] = el.getAttribute(attr); }); });
  var DICT = { es: ES, en: EN };
  var meta = function (sel) { return document.querySelector(sel); };
  var META = {
    es: { title: document.title, desc: meta('meta[name="description"]').content,
          ogTitle: meta('meta[property="og:title"]').content, ogDesc: meta('meta[property="og:description"]').content,
          locale: "es_ES", alt: "en_US", toggle: "EN", toggleLang: "en", toggleLabel: "EN, switch to English" },
    en: { title: "Open-DTF — Free, open-source DTF halftones for Photoshop",
          desc: "Open-DTF is a free (MIT) Photoshop plugin that prepares your designs for DTF printing: halftones, garment-color knockout and live adjustments.",
          ogTitle: "Open-DTF — Open-source DTF halftones",
          ogDesc: "Free Photoshop plugin: halftones, knockout and live adjustments for DTF. No licenses or subscriptions.",
          locale: "en_US", alt: "es_ES", toggle: "ES", toggleLang: "es", toggleLabel: "ES, cambiar a español" }
  };

  function apply(lang) {
    var d = DICT[lang] || ES;
    nodes.forEach(function (el) {
      var k = el.getAttribute("data-i18n") || el.getAttribute("data-i18n-html");
      if (d[k] === undefined) return;
      if (el.hasAttribute("data-i18n-html")) el.innerHTML = d[k]; else el.textContent = d[k];
    });
    attrNodes.forEach(function (el) { eachAttr(el, function (attr, k) { if (d[k] !== undefined) el.setAttribute(attr, d[k]); }); });
    var m = META[lang] || META.es;
    document.documentElement.lang = lang;
    document.title = m.title;
    meta('meta[name="description"]').content = m.desc;
    meta('meta[property="og:title"]').content = m.ogTitle;
    meta('meta[property="og:description"]').content = m.ogDesc;
    meta('meta[property="og:locale"]').content = m.locale;
    meta('meta[property="og:locale:alternate"]').content = m.alt;
    // El botón muestra el idioma al que cambia: su nombre accesible empieza por ese texto y va en ese idioma
    var t = document.getElementById("langToggle");
    if (t) { t.textContent = m.toggle; t.setAttribute("lang", m.toggleLang); t.setAttribute("aria-label", m.toggleLabel); }
    try { localStorage.setItem("lang", lang); } catch (e) {}
    window.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
  }

  var saved = null;
  try { saved = localStorage.getItem("lang"); } catch (e) {}
  var initial = saved || ((navigator.language || "es").toLowerCase().indexOf("es") === 0 ? "es" : "en");
  window.I18N = { apply: apply, get lang() { return document.documentElement.lang; }, t: function (k) { return (DICT[document.documentElement.lang] || ES)[k]; } };
  if (initial !== "es") apply("en");
  document.getElementById("langToggle").addEventListener("click", function () {
    apply(document.documentElement.lang === "es" ? "en" : "es");
  });
})();
