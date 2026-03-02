/* fp-seo.js
   Safe SEO enhancer:
   - Supports LOCAL testing: /?fuel=petrol&place=nr1
   - Supports LIVE routes:   /fuel/petrol/nr1/
   - Does NOT change core app logic; only uses existing UI controls
*/
(function () {
  if (window.__FP_SEO_LOADED__) return;
  window.__FP_SEO_LOADED__ = true;

  function parseSeoRoute() {
    // 1) LOCAL TEST MODE
    //    http://127.0.0.1:5501/?fuel=petrol&place=nr1
    var sp = new URLSearchParams(window.location.search || "");
    var qFuel = (sp.get("fuel") || "").toLowerCase();
    var qPlace = (sp.get("place") || "").trim();
    if ((qFuel === "petrol" || qFuel === "diesel") && qPlace) {
      return { fuel: qFuel, slug: qPlace };
    }

    // 2) LIVE SEO ROUTES
    //    https://fuelpilot.co.uk/fuel/petrol/nr1/
    var path = (window.location.pathname || "").toLowerCase();
    var m = path.match(/^\/fuel\/(petrol|diesel)\/([^\/]+)\/?$/);
    if (!m) return null;

    return {
      fuel: m[1],
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

    // Below-fold SEO block
    var h1 = document.getElementById("fpSeoH1");
    var intro = document.getElementById("fpSeoIntro");
    var statsBox = document.getElementById("fpSeoStats");
    var body = document.getElementById("fpSeoBody");

    if (h1) h1.textContent = "Cheap " + fuelTitle.toLowerCase() + " prices in " + place;
    if (intro) intro.textContent =
      "Compare live " + fuelTitle.toLowerCase() + " prices in " + place + " using FuelPilot’s map. Use the controls above to search, filter and get directions.";

    if (statsBox) statsBox.innerHTML = ""; // we can add stats later

    if (body) {
      body.innerHTML =
        "<p>Prices can vary between nearby forecourts. Use the map above to compare prices where available and find the best option close to you.</p>" +
        "<p>Tip: distance matters too — a slightly higher price closer to you can still work out cheaper overall.</p>";
    }

    // Title/meta/canonical
    var base = "https://fuelpilot.co.uk";
    var path = (window.location.pathname || "/").replace(/\/?$/, "/");
    var url = base + path;

    var title = "Cheap " + fuelTitle.toLowerCase() + " in " + place + " | FuelPilot";
    var desc = "Compare live " + fuelTitle.toLowerCase() + " prices in " + place + ". Use FuelPilot’s premium map to find the cheapest nearby stations.";

    document.title = title;
    setMetaDescription(desc);

    // Only set canonical on live route pages; for local testing keep it simple
    if (window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost") {
      setCanonical(url);
      setOg(url, title, desc);
    }
  }

  function applyRouteToUI(route) {
    // Fuel dropdown: your values are Petrol=E10, Diesel=DIESEL
    var fuelSel = document.getElementById("fpFuelSelect");
    if (fuelSel && fuelSel.tagName === "SELECT") {
      var targetFuel = (route.fuel === "diesel") ? "DIESEL" : "E10";
      if (fuelSel.value !== targetFuel) {
        fuelSel.value = targetFuel;
        fuelSel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // Search input
    var inp = document.getElementById("fpSearchInput");
    if (!inp) return;

  var q = (route.slug || "").replace(/-/g, " ").trim();
    inp.value = q.toUpperCase();
    inp.dispatchEvent(new Event("input", { bubbles: true }));

    // Wait for suggestions to appear, then click the first suggestion
// Wait until suggestions are ready, then click the BEST matching one (stable)
(function selectBestSuggestion() {
  var wanted = (route.slug || "").toUpperCase(); // e.g. "NR1"
  var tries = 0;

  var timer = setInterval(function () {
    tries += 1;

    var box = document.getElementById("fpSearchResults");
    if (!box) {
      if (tries >= 20) clearInterval(timer);
      return;
    }

    var items = Array.from(box.querySelectorAll(".fp-suggest"));
    if (!items.length) {
      if (tries >= 20) clearInterval(timer);
      return;
    }

    // Pick the first suggestion whose MAIN label starts with our slug (e.g. "NR1 2BD" starts with "NR1")
    // Always choose the first suggestion (stable for ambiguous places like London)
    var best = box.querySelector(".fp-suggest[data-idx='0']") || box.querySelector(".fp-suggest");

    if (!best) {
      if (tries >= 20) clearInterval(timer);
      return;
    }

    // If we didn't find a matching one yet, keep waiting a bit longer (prevents wrong-place clicks)
    if (!best) {
      if (tries >= 20) clearInterval(timer);
      return;
    }

    // Click it using a full event sequence (most reliable)
    best.focus();
    best.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }));
    best.dispatchEvent(new PointerEvent("pointerup",   { bubbles: true, cancelable: true, pointerId: 1 }));
    best.dispatchEvent(new MouseEvent("mousedown",    { bubbles: true, cancelable: true, view: window }));
    best.dispatchEvent(new MouseEvent("mouseup",      { bubbles: true, cancelable: true, view: window }));
    best.dispatchEvent(new MouseEvent("click",        { bubbles: true, cancelable: true, view: window }));

    clearInterval(timer);
  }, 150);
})();
    }

  // Sometimes your app finishes wiring events a moment after DOMContentLoaded.
  // We'll try a few times (fast, safe), then stop.
  function applyWithRetry(route) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;

      // Try applying route
      applyRouteToUI(route);

      // If the search results box exists, we consider the UI "ready enough"
      var inp = document.getElementById("fpSearchInput");
      var box = document.getElementById("fpSearchResults");

      if ((inp && box) || tries >= 10) {
        clearInterval(timer);
      }
    }, 200);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var route = parseSeoRoute();
    if (!route) return;

    renderSeo(route);
    applyWithRetry(route);
  });
})();