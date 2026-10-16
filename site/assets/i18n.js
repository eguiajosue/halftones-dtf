// Textos ES/EN. El español sale del propio HTML; aquí solo vive el inglés.
(function () {
  var EN = {
    "skip": "Skip to content",
    "nav.how": "How it works", "nav.why": "Why", "nav.faq": "FAQ", "nav.download": "Download",
    "hero.tag": "Free Photoshop plugin · MIT license",
    "hero.t1": "DTF halftones", "hero.t2": "without paying for licenses.",
    "hero.sub": "Open-DTF turns your artwork into a halftone ready for DTF film: it removes the garment color, builds the dots and lets you tune everything live. Free, with the code in the open.",
    "hero.cta": "Download Open-DTF", "hero.code": "View the code",
    "hero.meta": "Photoshop 2022 (23.3) or later · works offline · no accounts",
    "demo.title": "Try it here: move the screen", "demo.lpi": "Frequency", "demo.angle": "Angle", "demo.ko": "Knock out black",
    "how.title": "From your artwork to the film, in five steps",
    "s1.t": "Open your artwork and pick the size",
    "s1.p": "Open the art in Photoshop. Open-DTF reads the canvas and suggests the print size at 300 ppi; change the width and the height follows in proportion.",
    "s2.t": "Pick the screen and press Prepare",
    "s2.p": "Round, line, diamond or ellipse; frequency in LPI and angle. Prepare duplicates your document and builds the screen with native Photoshop features. Your original is never touched.",
    "s3.t": "Remove the garment color",
    "s3.p": "Pick the color you don't want to print, such as the black of a black tee. It disappears, and the transitions into it become dots: no boxes or halos around the design.",
    "s4.t": "Tune it live",
    "s4.p": "Levels, shadow boost, frequency and angle update while you drag. Switch between the Original, Garment, Alpha and Mask views to check the result.",
    "s5.t": "Apply and export",
    "s5.p": "Apply creates a new document with a single transparent layer, cleaned of stray dots. Export it as PNG and send it to your RIP.",
    "why.title": "Preparing a DTF print shouldn't cost <em>a license every year.</em>",
    "why.lead": "Paid halftone plugins charge per seat or per subscription. Open-DTF does the same core job with tools you already have in Photoshop, and anyone can read, improve or adapt its code.",
    "f1.t": "Free, forever", "f1.d": "No subscriptions, no activations and no seat limits.",
    "f2.t": "Open source (MIT)", "f2.d": "Use it in your shop, modify it or fit it into your workflow. Just keep the license notice.",
    "f3.t": "Photoshop's own engine", "f3.d": "The screen comes from adjustment layers, pattern fills and native filters. No pixel processing in JavaScript.",
    "f4.t": "Non-destructive", "f4.d": "It works on a duplicate. Cancel leaves everything as it was.",
    "f5.t": "Offline", "f5.d": "The plugin requests no network access: it never sends your designs anywhere.",
    "f6.t": "Presets", "f6.d": "Save your settings per garment or ink and bring them back with one click.",
    "dl.title": "Download Open-DTF", "dl.latest": "Latest version", "dl.button": "Download .ccx",
    "dl.all": "All versions and release notes",
    "dl.none": "No version has been published yet. Meanwhile you can load the plugin from source with UXP Developer Tool.",
    "dl.req": "Requirements", "dl.reqp": "Adobe Photoshop 2022 (23.3) or later, on Windows or macOS.",
    "dl.inst": "Installation",
    "dl.i1": "Download the <code>.ccx</code> file.",
    "dl.i2": "Double-click it: Creative Cloud installs it and asks you to confirm, because it doesn't come from the Marketplace.",
    "dl.i3": "Open Photoshop and go to <code>Plugins › Open-DTF</code>.",
    "faq.title": "Frequently asked questions",
    "q1": "Is it really free?", "a1": "Yes. Open-DTF is released under the MIT license: use it in your business, install it on every machine and modify it without paying anything.",
    "q2": "Which Photoshop version do I need?", "a2": "Photoshop 2022 (23.3) or later. It's a UXP plugin, Adobe's current plugin system.",
    "q3": "Does it work on Mac?", "a3": "UXP plugins run on Windows and macOS, and the plugin uses nothing system-specific. So far it has been tested on Windows; if you use it on a Mac, tell us how it goes in the issues.",
    "q4": "Does it change my original file?", "a4": "No. Prepare works on a duplicate called “design - Prep”. Apply creates a new document “design - Prepped”. If you cancel, the duplicate is closed.",
    "q5": "Does it replace my RIP?", "a5": "No. Open-DTF prepares the image (screen, knockout and transparency). Ink management, the white underbase and printing are still your RIP's job.",
    "q6": "Which frequency (LPI) should I use?", "a6": "Start at 30 LPI, the default, and adjust for your printer and fabric: higher LPI gives finer dots; lower LPI gives bigger dots and a softer hand.",
    "q7": "Can I remove a color other than black?", "a7": "Yes. Knockout accepts any color: a red tee, a white background or anything you pick with Photoshop's eyedropper.",
    "q8": "Does it send my designs to a server?", "a8": "No. The plugin declares no network permissions, so Photoshop won't let it connect to the internet. Everything happens on your computer.",
    "q9": "I found a bug, what do I do?", "a9": "Open an <a href=\"https://github.com/eguiajosue/halftones-dtf/issues\" rel=\"noopener\">issue on GitHub</a> with your Photoshop version, the panel message and, if you can, a screenshot.",
    "ct.title": "Built in the open. Improve it with us.",
    "ct.repo": "Source code", "ct.issues": "Report a problem or suggest an idea", "ct.guide": "Contributing guide",
    "foot.l": "MIT license · Not affiliated with Adobe. Photoshop is a trademark of Adobe.",
    "foot.c": "3D model “<a href=\"https://sketchfab.com/3d-models/t-shirt-3d-model-free-408000a9975a4c34866b42dfaca4fa75\" rel=\"noopener\">T-SHIRT 3D Model Free</a>” by <a href=\"https://sketchfab.com/MohammadRajabloo\" rel=\"noopener\">Mohammad Rajabloo</a>, <a href=\"http://creativecommons.org/licenses/by/4.0/\" rel=\"noopener\">CC BY 4.0</a> license. Modified: repaired and simplified for the web."
  };

  var ES = {};
  var nodes = document.querySelectorAll("[data-i18n],[data-i18n-html]");
  nodes.forEach(function (el) {
    var k = el.getAttribute("data-i18n") || el.getAttribute("data-i18n-html");
    ES[k] = el.hasAttribute("data-i18n-html") ? el.innerHTML : el.textContent;
  });
  var DICT = { es: ES, en: EN };
  var META = {
    es: { title: document.title, desc: document.querySelector('meta[name="description"]').content },
    en: { title: "Open-DTF — Free, open-source DTF halftones for Photoshop",
          desc: "Open-DTF is a free (MIT) Photoshop plugin that prepares your designs for DTF printing: halftones, garment-color knockout and live adjustments." }
  };

  function apply(lang) {
    var d = DICT[lang] || ES;
    nodes.forEach(function (el) {
      var k = el.getAttribute("data-i18n") || el.getAttribute("data-i18n-html");
      if (d[k] === undefined) return;
      if (el.hasAttribute("data-i18n-html")) el.innerHTML = d[k]; else el.textContent = d[k];
    });
    document.documentElement.lang = lang;
    document.title = META[lang].title;
    document.querySelector('meta[name="description"]').content = META[lang].desc;
    var t = document.getElementById("langToggle");
    if (t) t.textContent = lang === "es" ? "EN" : "ES";
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
