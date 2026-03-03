(function () {
  "use strict";

  const path = (location.pathname || "").toLowerCase();
  const sp = new URLSearchParams(location.search || "");

  const hasSeoQuery = sp.get("fuel") && sp.get("place");
  const hasSeoPath = /^\/fuel\/(petrol|diesel)\/[^\/\?]+\/?$/.test(path);

  if (!(hasSeoQuery || hasSeoPath)) return;

  // Force SEO mode ON for the main app
  window.__FP_SEO_MODE__ = true;
  document.body.classList.add("fp-seo-mode");

  // Force Search-this-area visibility after landing
  window.__FP_SEO_FORCE_SEARCH_AREA__ = true;

  function $(sel) { return document.querySelector(sel); }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function ensureMeta(name) {
    let tag = document.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", name);
      document.head.appendChild(tag);
    }
    return tag;
  }

  function ensureCanonical() {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    return link;
  }

  function normalizeFuel(f) {
    const s = String(f || "").toLowerCase();
    return s.includes("diesel") ? "diesel" : "petrol";
  }

  function cleanSlug(s) {
    return String(s || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  }

  function parseSeoRoute() {
    const path = (location.pathname || "").toLowerCase();
    const sp = new URLSearchParams(location.search || "");

    const qFuel = sp.get("fuel");
    const qPlace = sp.get("place");

    if (qPlace) {
      return { fuel: normalizeFuel(qFuel), slug: cleanSlug(qPlace) };
    }

    const m = path.match(/^\/fuel\/(petrol|diesel)\/([^\/\?]+)\/?$/i);
    if (m) {
      return { fuel: normalizeFuel(m[1]), slug: cleanSlug(m[2]) };
    }

    return null;
  }

  function fpKmBetween(aLat, aLng, bLat, bLng) {
    const R = 6371; // km
    const toRad = (d) => (d * Math.PI) / 180;

    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);

    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);

    const s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    return R * c;
  }

  function slugToQuery(s) {
    return String(s || "")
      .replace(/-/g, " ")
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ----- places.json lookup (optional) -----
  let PLACES = null;

  async function loadPlaces() {
    if (PLACES) return PLACES;
    try {
      const res = await fetch("/data/places.json", { cache: "force-cache" });
      const json = await res.json();
      const arr = Array.isArray(json.places) ? json.places : [];
      const map = new Map();
      for (const p of arr) {
        if (p && p.slug) map.set(String(p.slug).toLowerCase(), p);
      }
      PLACES = map;
      return PLACES;
    } catch (e) {
      console.warn("[FP SEO] places.json not available", e);
      PLACES = new Map();
      return PLACES;
    }
  }

  async function enrich(route) {
    const map = await loadPlaces();
    const hit = map.get(route.slug);
    const name = hit && hit.name ? String(hit.name) : route.slug.toUpperCase();
    return { ...route, name, type: hit && hit.type ? String(hit.type) : "unknown" };
  }

  // ---- places.json loader (cached) ----
  let __FP_PLACES_CACHE__ = null;

  async function fpLoadPlaces() {
    if (__FP_PLACES_CACHE__) return __FP_PLACES_CACHE__;

    const res = await fetch("/data/places.json", { cache: "force-cache" });
    if (!res.ok) throw new Error(`places.json fetch failed: ${res.status}`);

    const data = await res.json();
    __FP_PLACES_CACHE__ = Array.isArray(data) ? data : (data.places || []);
    return __FP_PLACES_CACHE__;
  }

  function fpSeoNavigate(href) {
  try {
    // If your router exposes a navigate function, use it
    if (window.__FP_NAVIGATE__) {
      window.__FP_NAVIGATE__(href);
      return;
    }
    if (typeof window.fpNavigate === "function") {
      window.fpNavigate(href);
      return;
    }
  } catch (e) {}

  // Fallback: normal navigation
  window.location.href = href;
}

  function renderSeo(route) {
    const fuelLabel = route.fuel === "diesel" ? "diesel" : "petrol";
    const placeLabel = route.name;

   fpLoadPlaces()
   .then((places) => console.log("[SEO] places loaded:", places.length))
   .catch((e) => console.warn("[SEO] places load error:", e));

    // ✅ SAFE: only set if nodes exist (no crashes)
    const h1 = document.getElementById("fpSeoH1");
    if (h1) h1.textContent = `Cheap ${fuelLabel} in ${placeLabel} and nearby`;

    const intro = document.getElementById("fpSeoIntro");
    if (intro) intro.textContent = `Live ${fuelLabel} prices around ${placeLabel}. Pan the map and use “Search this area” to refresh nearby stations.`;

    const stats = document.getElementById("fpSeoStats");
    if (stats) {
      stats.innerHTML = `
        <div class="fp-seo-stat">Map-first</div>
        <div class="fp-seo-stat">Compare nearby areas</div>
        <div class="fp-seo-stat">Fast to use</div>
      `;
    }

    const body = document.getElementById("fpSeoBody");
    if (body) {
      body.innerHTML = `
        <p>FuelPilot shows fuel prices on a live map for <strong>${placeLabel}</strong> and nearby areas.</p>
        <p>Pan or zoom, then tap <strong>Search this area</strong> to refresh results for what’s on screen.</p>
      `;

      fpLoadPlaces()
        .then((places) => {
          if (!Array.isArray(places)) return;

          const currentSlug = route.slug || "";
          const others = places.filter((p) => p && p.slug && p.slug !== currentSlug);

          // Deterministic alphabetical sort
          others.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

          // Smarter deterministic cluster (no geo needed)
        const currentPlace =
          places.find((p) => p && p.slug === currentSlug) ||
          places.find((p) => p && String(p.name || "").toLowerCase().includes(String(route.name || "").toLowerCase())) ||
          null;

        const aLat = currentPlace && Number(currentPlace.lat);
        const aLng = currentPlace && Number(currentPlace.lng);

        let candidates = places.filter((p) => {
          if (!p || !p.slug || p.slug === currentSlug) return false;
          const lat = Number(p.lat);
          const lng = Number(p.lng);
          return isFinite(lat) && isFinite(lng);
        });

        if (isFinite(aLat) && isFinite(aLng)) {
          candidates.sort((p1, p2) => {
            const d1 = fpKmBetween(aLat, aLng, Number(p1.lat), Number(p1.lng));
            const d2 = fpKmBetween(aLat, aLng, Number(p2.lat), Number(p2.lng));
            return d1 - d2;
          });
        } else {
          // Fallback if a place has no centroid (should be rare)
          candidates.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
        }

        const cluster = candidates.slice(0, 8);

          let petrolLinks = "";
          let dieselLinks = "";

          console.log("[SEO] cluster size:", cluster.length);

          for (const p of cluster) {
            const slug = p.slug;
            const name = p.name || slug;

            const pHref = "/fuel/petrol/" + encodeURIComponent(slug) + "/";
            const dHref = "/fuel/diesel/" + encodeURIComponent(slug) + "/";

            petrolLinks += '<a href="' + pHref + '" data-fp-href="' + pHref + '">' + name + "</a> ";
            dieselLinks += '<a href="' + dHref + '" data-fp-href="' + dHref + '">' + name + "</a> ";
                      }

          const html =
            '<div class="fp-seo-cluster">' +
              "<h3>Nearby petrol pages</h3>" +
              '<div class="fp-seo-links">' +
                petrolLinks +
              "</div>" +
              '<h3 style="margin-top:14px;">Nearby diesel pages</h3>' +
              '<div class="fp-seo-links">' +
                dieselLinks +
              "</div>" +
            "</div>";

          body.insertAdjacentHTML("beforeend", html);

        // Intercept cluster link clicks so SPA routing works
        const clusterEl = body.querySelector(".fp-seo-cluster:last-of-type");
        if (clusterEl) {
          clusterEl.addEventListener("click", (ev) => {
            const a = ev.target && ev.target.closest ? ev.target.closest("a[data-fp-href]") : null;
            if (!a) return;
            ev.preventDefault();
            fpSeoNavigate(a.getAttribute("data-fp-href"));
          });
}

        })
        .catch((e) => console.warn("[SEO] cluster build failed:", e));
    }

    // Title + meta description + canonical
    document.title = `Cheap ${fuelLabel} in ${placeLabel} and nearby | FuelPilot`;

    ensureMeta("description").setAttribute(
      "content",
      `Live ${fuelLabel} prices in ${placeLabel} and nearby. Compare stations on a map and find cheaper fuel fast.`
    );

    // Canonical: prefer clean path
    const canon = ensureCanonical();
    canon.setAttribute("href", location.origin + location.pathname.replace(/\/?$/, "/"));
  }

  function trySetFuel(route) {
    const sel = document.getElementById("fpFuelSelect");
    if (!sel || sel.tagName !== "SELECT") return false;

    const target = route.fuel === "diesel" ? "DIESEL" : "E10";
    if (sel.value !== target) {
      sel.value = target;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  async function clickFirstSuggestion() {
    const box = document.getElementById("fpSearchResults");
    if (!box) return false;

    const first = box.querySelector(".fp-suggest[role='button']") || box.querySelector(".fp-suggest");
    if (!first) return false;
    first.click();
    return true;
  }

  async function driveSearch(route) {
    const inp = document.getElementById("fpSearchInput");
    if (!inp) return false;

    const q = slugToQuery(route.name || route.slug).toUpperCase();

    inp.value = q;
    inp.dispatchEvent(new Event("input", { bubbles: true }));

    for (let i = 0; i < 30; i++) {
      await sleep(120);
      const ok = await clickFirstSuggestion();
      if (ok) { try { inp.blur(); } catch (e) {} return true; }
    }

    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    try { inp.blur(); } catch (e) {}
    return true;
  }

  async function applyRoute(route) {
    // Wait until controls exist
    for (let i = 0; i < 60; i++) {
      const okFuel = trySetFuel(route);
      const okInput = !!document.getElementById("fpSearchInput");
      if (okFuel && okInput) break;
      await sleep(120);
    }

    await driveSearch(route);

    // ✅ Keep "Search this area" visible after landing (fuelpilot.js reads this)
    window.__FP_SEO_FORCE_SEARCH_AREA__ = true;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const r0 = parseSeoRoute();
    if (!r0) return;

    const r = await enrich(r0);

    // Render SEO text (safe)
    try { renderSeo(r); } catch (e) { console.warn("[FP SEO] renderSeo failed", e); }

    // Drive UI (safe)
    try { applyRoute(r); } catch (e) { console.warn("[FP SEO] applyRoute failed", e); }
  });
})();