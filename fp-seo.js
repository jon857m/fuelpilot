/* fp-seo.js
   - Safe SEO enhancer for /fuel/... routes
   - Does NOT touch core map logic (it only triggers your existing search input)
*/
(function () {
  if (window.__FP_SEO_LOADED__) return;
  window.__FP_SEO_LOADED__ = true;

  function parseSeoRoute() {
    // /fuel/petrol/nr1/
    // /fuel/diesel/sw1a/
    var path = (window.location.pathname || "").toLowerCase();
    var m = path.match(/^\/fuel\/(petrol|diesel)\/([^\/]+)\/?$/);
    if (!m) return null;

    return {
      fuel: m[1], // petrol|diesel
      slug: decodeURIComponent(m[2] || "").trim()
    };
  }

  function setCanonical(url) {
    var link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", url);
  }

  function setMetaDescription(text) {
    var md = document.querySelector('meta[name="description"]');
    if (!md) {
      md = document.createElement("meta");
      md.setAttribute("name", "description");
      document.head.appendChild(md);
    }
    md.setAttribute("content", text);
  }

  function setOg(url, title, desc) {
    function upsert(prop, value) {
      var el = document.querySelector('meta[property="' + prop + '"]');
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", prop);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    }
    upsert("og:url", url);
    if (title) upsert("og:title", title);
    if (desc) upsert("og:description", desc);
  }

  function renderSeo(route) {
    var place = (route.slug || "").toUpperCase();
    var fuelTitle = (route.fuel === "diesel") ? "Diesel" : "Petrol";

    var h1 = document.getElementById("fpSeoH1");
    var intro = document.getElementById("fpSeoIntro");
    var statsBox = document.getElementById("fpSeoStats");
    var body = document.getElementById("fpSeoBody");

    if (h1) h1.textContent = "Cheap " + fuelTitle.toLowerCase() + " prices in " + place;
    if (intro) intro.textContent =
      "Compare live " + fuelTitle.toLowerCase() + " prices in " + place + " using FuelPilot’s map. Use the controls above to search, filter and get directions.";

    if (statsBox) statsBox.innerHTML = ""; // stats hook later (tonight we ship without it)

    if (body) {
      body.innerHTML =
        "<p>Prices can vary between nearby forecourts. Use the map above to compare today’s prices where available and find the cheapest option close to you.</p>" +
        "<p>Tip: distance matters too — a slightly higher price closer to you can still work out cheaper overall.</p>";
    }

    var url = "https://fuelpilot.co.uk" + window.location.pathname.replace(/\/?$/, "/");
    var title = "Cheap " + fuelTitle.toLowerCase() + " in " + place + " | FuelPilot";
    var desc = "Compare live " + fuelTitle.toLowerCase() + " prices in " + place + ". Use FuelPilot’s premium map to find the cheapest nearby stations.";

    document.title = title;
    setMetaDescription(desc);
    setCanonical(url);
    setOg(url, title, desc);
  }

  function applyRouteToUI(route) {
    // Fuel dropdown
    var fuelSel = document.getElementById("fpFuelSelect");
    if (fuelSel && fuelSel.tagName === "SELECT") {
      // Map SEO petrol/diesel to your values: Petrol=E10, Diesel=DIESEL
      var target = (route.fuel === "diesel") ? "DIESEL" : "E10";
      if (fuelSel.value !== target) {
        fuelSel.value = target;
        fuelSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // Search input
    var inp = document.getElementById("fpSearchInput");
    if (inp) {
      inp.value = (route.slug || "").toUpperCase();
      inp.dispatchEvent(new Event("input", { bubbles: true }));

      // Trigger whatever your existing search uses (Enter is common)
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", which: 13, keyCode: 13, bubbles: true }));
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Only run on SEO routes
    var route = parseSeoRoute();
    if (!route) return;

    // Render SEO immediately
    renderSeo(route);

    // Then try to drive the UI using your existing controls
    // (If your app initializes later, we can add a tiny retry loop)
    applyRouteToUI(route);
  });
})();