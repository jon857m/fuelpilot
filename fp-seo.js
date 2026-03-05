(function () {
  "use strict";

  const rawPath = (location.pathname || "");
  const path = rawPath.toLowerCase();

  // --- Station route parsing (/station/<node_id OR slug>) ---
  const stationMatch = rawPath.match(/^\/station\/([^\/\?]+)\/?$/i);
  const stationKeyRaw = stationMatch ? stationMatch[1] : null;
  const stationKey = stationKeyRaw ? decodeURIComponent(stationKeyRaw) : null;

  // If it's an ID (your current node ids are long hex strings), treat it as id.
  // Otherwise treat it as a pretty slug and look up the id in station-slugs.json.
  const stationKeyLower = stationKey ? stationKey.toLowerCase() : null;
  const stationKeyIsId = !!(stationKeyLower && /^[a-f0-9]{64}$/i.test(stationKeyLower));

  // Back-compat: some code below still expects this name
  let stationIdFromPath = stationKeyIsId ? stationKeyLower : null;

  const sp = new URLSearchParams(location.search || "");

  const hasSeoQuery = sp.get("fuel") && sp.get("place");
  const hasSeoPath  = /^\/fuel\/(petrol|diesel)\/[^\/\?]+\/?$/.test(path);

  // NEW: station pages
  const hasStationPath = /^\/station\/[^\/\?]+\/?$/.test(path);

  // Any SEO page type?
  const isSeoPage = !!(hasSeoQuery || hasSeoPath || hasStationPath);

  if (!isSeoPage) return;

  // Force SEO mode ON for the main app
  window.__FP_SEO_MODE__ = true;
  document.body.classList.add("fp-seo-mode");

  // --- Station slug map (cached) ---
// We only use this when the route is /station/<slug> (not when it's already an ID).
const __FP_STATION_SLUGS_URLS__ = [
  "/data/station-slugs.json"
];

let __fpStationSlugsPromise = null;

async function fpLoadStationSlugs() {
  if (__fpStationSlugsPromise) return __fpStationSlugsPromise;

  __fpStationSlugsPromise = (async () => {
    let lastErr = null;

    for (const url of __FP_STATION_SLUGS_URLS__) {
      try {
        const res = await fetch(url, { headers: { "accept": "application/json" } });
        if (!res.ok) { lastErr = new Error(`Slug map fetch failed ${res.status} at ${url}`); continue; }

        const json = await res.json();
        // Expecting: { "<pretty-slug>": "<node_id>", ... }
        if (json && typeof json === "object") return json;

        lastErr = new Error(`Slug map JSON invalid at ${url}`);
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("Slug map fetch failed");
  })();

  return __fpStationSlugsPromise;
}

async function fpResolveStationSlugToId(slug) {
  const map = await fpLoadStationSlugs();
  const key = (slug || "").toLowerCase();
  return map[key] || null;
}

  // NEW: simple station-page placeholder (safe, removable)
  if (stationKey) {
    let box = document.getElementById("fpStationSeoBox");
    // NEW: simple station-page placeholder (safe, removable)
      if (stationKey) {
      box = document.createElement("div");
      box.id = "fpStationSeoBox";
      box.style.cssText = `
        position: relative;
        z-index: 5;
        margin: 12px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.35);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        color: #e9eef5;
        max-width: 720px;
      `;
      document.body.prepend(box);
    }

box.innerHTML = `
  <div style="font-weight:800;letter-spacing:-0.02em;margin-bottom:6px;">
    Loading station…
  </div>
  <div style="opacity:0.75;font-size:12px;">
    ID: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${stationKey}</span>
  </div>
`;

// Fetch station data from your existing API endpoint
(async () => {
  try {
    // Resolve /station/<slug> to node_id using /data/station-slugs.json
     stationIdFromPath = stationKeyIsId
      ? stationKeyLower
      : await fpResolveStationSlugToId(stationKeyLower);

    if (!stationIdFromPath) {
      box.innerHTML = `
        <div style="font-weight:800;margin-bottom:6px;">Station not found</div>
        <div style="opacity:0.75;font-size:13px;">Unknown station slug: ${stationKey}</div>
      `;
      return;
    }

    // (Optional) show the resolved ID in the box while loading
    box.innerHTML = `
      <div style="font-weight:800;letter-spacing:-0.02em;margin-bottom:6px;">
        Loading station…
      </div>
      <div style="opacity:0.75;font-size:12px;">
        ID: <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${stationIdFromPath}</span>
      </div>
    `;

    const apiUrl = `https://fuelpilot-api.jonmargree.workers.dev/api/fuel/station?id=${encodeURIComponent(stationIdFromPath)}`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    const s = data?.station || data; // supports either {station:{}} or direct station
    const meta = s?.meta || {};
    const loc = meta?.location || {};

    // phone / opening / amenities (from meta)
    const phone =
      (meta?.public_phone_number || s?.public_phone_number || "").toString().trim();

    const usualDays = meta?.opening_times?.usual_days || null;
    const amenities = Array.isArray(meta?.amenities) ? meta.amenities : [];

    function prettifyAmenity(a) {
      const map = {
        adblue_packaged: "AdBlue",
        customer_toilets: "Toilets",
        water_filling: "Water",
      };
      const raw = (a || "").toString().trim();
      if (!raw) return "";
      if (map[raw]) return map[raw];
      // fallback: "car_wash" -> "Car wash"
      return raw
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    }

    function formatDayHours(dayObj) {
      if (!dayObj) return "—";
      if (dayObj.is_24_hours) return "Open 24h";
      const o = (dayObj.open || "").slice(0, 5);
      const c = (dayObj.close || "").slice(0, 5);
      if (!o || !c || (o === "00:00" && c === "00:00")) return "—";
      return `${o}–${c}`;
    }

      function to24h(v) {
        const s = (v || "").toString().slice(0, 5);
        return /^\d{2}:\d{2}$/.test(s) ? s : "";
      }

      function buildOpeningHoursSpec(usualDays) {
        if (!usualDays) return [];
        const map = [
          ["Monday", "monday"],
          ["Tuesday", "tuesday"],
          ["Wednesday", "wednesday"],
          ["Thursday", "thursday"],
          ["Friday", "friday"],
          ["Saturday", "saturday"],
          ["Sunday", "sunday"],
        ];

        const out = [];

        for (const [label, key] of map) {
          const d = usualDays[key];
          if (!d) continue;
          if (d.is_24_hours) {
            out.push(`${label} 00:00-23:59`);
            continue;
          }
          const o = to24h(d.open);
          const c = to24h(d.close);
          if (!o || !c) continue;
          if (o === "00:00" && c === "00:00") continue;
          out.push(`${label} ${o}-${c}`);
        }

        return out;
      }

      function safeJson(obj) {
        return JSON.stringify(obj).replace(/</g, "\\u003c");
      }


    const brand = (meta?.brand_name || "").toString().trim() || "Fuel station";
    const name = (meta?.trading_name || s?.trading_name || "").toString().trim();
    const town = (loc?.city || "").toString().trim();
    const postcode = (loc?.postcode || "").toString().trim();
    const line1 = (loc?.address_line_1 || "").toString().trim();

    // ---- SEO: title/description/canonical for station pages ----
    const prettyName = name || brand;
    const placeBits = [town, postcode].filter(Boolean).join(" ");
    const seoTitle = `${brand}${placeBits ? ` in ${placeBits}` : ""} — live fuel prices & opening times | FuelPilot`;
    const seoDesc =
      `Live petrol & diesel prices for ${prettyName}${placeBits ? ` (${placeBits})` : ""}. ` +
      `Compare nearby fuel stations and get directions with FuelPilot.`;

    document.title = seoTitle;

    ensureMeta("description").setAttribute("content", seoDesc);
    ensureMeta("robots").setAttribute("content", "index, follow, max-image-preview:large");

    // canonical
    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement("link");
      canon.setAttribute("rel", "canonical");
      document.head.appendChild(canon);
    }
    canon.setAttribute("href", `https://fuelpilot.co.uk/station/${stationIdFromPath}`);

    // OpenGraph + Twitter (minimal, safe)
    function ensureProp(prop) {
      let t = document.querySelector(`meta[property="${prop}"]`);
      if (!t) { t = document.createElement("meta"); t.setAttribute("property", prop); document.head.appendChild(t); }
      return t;
    }
    function ensureTw(name) {
      let t = document.querySelector(`meta[name="${name}"]`);
      if (!t) { t = document.createElement("meta"); t.setAttribute("name", name); document.head.appendChild(t); }
      return t;
    }
    ensureProp("og:title").setAttribute("content", seoTitle);
    ensureProp("og:description").setAttribute("content", seoDesc);
    ensureProp("og:url").setAttribute("content", `https://fuelpilot.co.uk/station/${stationIdFromPath}`);
    ensureProp("og:type").setAttribute("content", "website");
    ensureTw("twitter:title").setAttribute("content", seoTitle);
    ensureTw("twitter:description").setAttribute("content", seoDesc);

    // prices
    const prices = Array.isArray(s?.fuel_prices) ? s.fuel_prices : [];
    const priceLines = prices
      .map(p => {
        const ft = (p.fuel_type || "").toString();
        const pr = (p.price ?? "").toString();
        return `<div style="display:flex;justify-content:space-between;gap:10px;">
          <span style="opacity:0.8">${ft}</span>
          <span style="font-weight:700">${pr}${pr ? "p" : ""}</span>
        </div>`;
      })
      .join("");

         // Nearby stations (temporary approach: use /api/fuel/near)
    let nearbyHtml = `<div style="opacity:0.7;font-size:13px;">Nearby stations not available.</div>`;

    const lat = loc?.latitude;
    const lng = loc?.longitude;

    if (typeof lat === "number" && typeof lng === "number") {
      const nearUrl =
        `https://fuelpilot-api.jonmargree.workers.dev/api/fuel/near` +
        `?lat=${encodeURIComponent(lat)}` +
        `&lng=${encodeURIComponent(lng)}` +
        `&fuel=E10` +
        `&radiusMiles=10` +
        `&limit=25` +
        `&sort=distance` +
        `&includeMissing=1`;

      const nearRes = await fetch(nearUrl, { headers: { "accept": "application/json" } });

      if (nearRes.ok) {
        const nearData = await nearRes.json();

        console.log("[Station SEO] nearData keys:", Object.keys(nearData || {}));
        console.log("[Station SEO] nearData sample:", nearData);

        const list = Array.isArray(nearData?.stations) ? nearData.stations : (Array.isArray(nearData) ? nearData : []);

        console.log("[Station SEO] stations returned:", list.length);
        console.log("[Station SEO] first station keys:", list[0] ? Object.keys(list[0]) : null);
        console.log("[Station SEO] first station node_id/meta.node_id:", list[0]?.node_id, list[0]?.meta?.node_id);

        // Remove itself, then take first 20
        const filtered = list.filter(x => (x?.node_id || x?.meta?.node_id) !== stationIdFromPath).slice(0, 20);

        if (filtered.length) {
          nearbyHtml = filtered.map(x => {
        const xid = (x?.id || "").toString().trim();
        const xbrand = (x?.brand || "").toString().trim() || "Station";
        const xname = (x?.name || "").toString().trim();
        const xpc = (x?.postcode || "").toString().trim();
        const xdist = (x?.distanceMiles ?? "").toString();

        if (!xid) return "";

        return `
          <a href="/station/${encodeURIComponent(xid)}"
            style="display:flex;justify-content:space-between;gap:10px;
                    padding:10px 0;text-decoration:none;color:#e9eef5;
                    border-top:1px solid rgba(255,255,255,0.08);">
            <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${xbrand}${xname ? ` — ${xname}` : ""}
            </span>
            <span style="opacity:0.75;white-space:nowrap;">
              ${xdist ? `${Number(xdist).toFixed(1)} mi` : xpc}
            </span>
          </a>
        `;
          }).join("");
        } else {
          nearbyHtml = `<div style="opacity:0.7;font-size:13px;">No nearby stations found.</div>`;
        }
      }
    } 

    const phoneLine = phone
      ? `<div style="opacity:0.85;font-size:13px; margin-top:6px;">Phone: <a href="tel:${phone.replace(/\s+/g, "")}" style="color:#e9eef5;text-decoration:none;font-weight:700;">${phone}</a></div>`
      : "";

    const openingHtml = usualDays
      ? (() => {
          const days = [
            ["Mon", "monday"],
            ["Tue", "tuesday"],
            ["Wed", "wednesday"],
            ["Thu", "thursday"],
            ["Fri", "friday"],
            ["Sat", "saturday"],
            ["Sun", "sunday"],
          ];
          const rows = days
            .map(([label, key]) => {
              const v = formatDayHours(usualDays[key]);
              return `<div style="display:flex;justify-content:space-between;gap:12px;">
                        <span style="opacity:0.75">${label}</span>
                        <span style="font-weight:700">${v}</span>
                      </div>`;
            })
            .join("");
          return `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.10);">
              <div style="font-weight:800;margin-bottom:8px;">Opening hours</div>
              <div style="display:grid;gap:6px;font-size:13px;">${rows}</div>
            </div>
          `;
        })()
      : "";

    const amenitiesHtml = amenities.length
      ? (() => {
          const chips = amenities
            .map(prettifyAmenity)
            .filter(Boolean)
            .slice(0, 12)
            .map(
              (t) =>
                `<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);font-size:12px;opacity:0.95;">${t}</span>`
            )
            .join("");
          return `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.10);">
              <div style="font-weight:800;margin-bottom:8px;">Facilities</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">${chips}</div>
            </div>
          `;
        })()
      : "";

        const stationUrl = `https://fuelpilot.co.uk/station/${encodeURIComponent(
          stationIdFromPath
        )}`;

        const openingHoursSpec = buildOpeningHoursSpec(usualDays);

        const jsonLd = {
          "@context": "https://schema.org",
          "@type": "GasStation",
          "@id": stationUrl,
          name: `${brand}${town ? ` ${town}` : ""}`.trim() || name || "Fuel station",

          brand: brand
            ? {
                "@type": "Brand",
                name: brand
              }
            : undefined,






          telephone: phone || undefined,
          url: stationUrl,
          address: {
            "@type": "PostalAddress",
            streetAddress: [line1, (loc?.address_line_2 || "").toString().trim()]
              .filter(Boolean)
              .join(", "),
            addressLocality: town || undefined,
            postalCode: postcode || undefined,
            addressCountry: (loc?.country || "").toString().trim() || "GB",
          },
          geo:
            typeof loc?.latitude === "number" && typeof loc?.longitude === "number"
              ? {
                  "@type": "GeoCoordinates",
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                }
              : undefined,
          openingHoursSpecification:
            openingHoursSpec.length > 0 ? openingHoursSpec : undefined,


            amenityFeature: amenities.length
              ? amenities.map(a => ({
                  "@type": "LocationFeatureSpecification",
                  name: prettifyAmenity(a),
                  value: true
                }))
              : undefined,


            makesOffer: prices.length
            ? prices.map(p => ({
                "@type": "Offer",
                price: String(p.price),
                priceCurrency: "GBP",
                name: p.fuel_type
              }))
            : undefined,


        };



    box.innerHTML = `
      
    <style>

        .fp-nearby-list {
          display:block;
        }

        @media (max-width:720px){
          .fp-nearby-list {
            max-height:220px;
            overflow:auto;
          }
        }

      /* Station card mobile layout */
      @media (max-width: 720px) {
        .fp-st-head { flex-direction: column; align-items: flex-start !important; }
        .fp-st-cta { width: 100%; justify-content: flex-start !important; flex-wrap: wrap; }
        .fp-st-cta a { width: auto; }
        .fp-st-grid { grid-template-columns: 1fr !important; }
      }
    </style>

    <script id="fp-jsonld-gasstation" type="application/ld+json">${safeJson(jsonLd)}</script>

    <div class="fp-st-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div style="font-weight:900;letter-spacing:-0.02em;line-height:1.15;">
            ${brand}${town ? ` in ${town}` : ""}
          </div>
          <div style="opacity:0.8;font-size:13px;margin-top:6px;line-height:1.35;">
            ${name ? `${name}<br>` : ""}
            ${line1 ? `${line1}<br>` : ""}
            ${postcode ? postcode : ""}
            ${phoneLine}
            ${openingHtml}
            ${amenitiesHtml}
          </div>
        </div>
      <div class="fp-st-cta" style="display:flex;align-items:center;gap:10px;flex-shrink:0;justify-content:flex-end;">
        <a href="/for-forecourts?station=${encodeURIComponent(stationIdFromPath)}"
          style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;
                  padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.18);
                  background:rgba(255,255,255,0.12);color:#e9eef5;font-weight:800;">
          Claim this station
        </a>

        <a href="/?station=${encodeURIComponent(stationIdFromPath)}"
          style="display:inline-flex;align-items:center;gap:8px;text-decoration:none;
                  padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.14);
                  background:rgba(255,255,255,0.06);color:#e9eef5;font-weight:700;">
          Back to map
        </a>
      </div>
      </div>

      <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.10);">
        <div style="font-weight:800;margin-bottom:8px;">Current prices</div>
        ${priceLines || `<div style="opacity:0.7;font-size:13px;">No prices available.</div>`}
      </div>

      <div style="margin-top:24px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);opacity:0.85;">
        <div style="font-weight:700;margin-bottom:8px;font-size:14px;opacity:0.8;">
          Other nearby fuel stations
        <div class="fp-nearby-list">
          ${nearbyHtml}
        </div>
      </div>


    `;
  } catch (err) {
    box.innerHTML = `
      <div style="font-weight:800;margin-bottom:6px;">Station not available</div>
      <div style="opacity:0.75;font-size:13px;">${String(err)}</div>
    `;
  }
})();
  }

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
    const BUILD = "20260303"; // 🔁 bump this when places.json changes

    const isDev =
      location.hostname === "127.0.0.1" ||
      location.hostname === "localhost";

    const url =
      "/data/places.json?v=" + (isDev ? Date.now() : BUILD);

    const res = await fetch(url, {
      cache: isDev ? "no-store" : "force-cache"
    });

    const json = await res.json();
    const arr = Array.isArray(json.places) ? json.places : [];

    const map = new Map();
    for (const p of arr) {
      if (p && p.slug) {
        map.set(String(p.slug).toLowerCase(), p);
      }
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

    const FP_SEO_BLOCKED_BASES = new Set([
      "ESSEX",
      "GREATER LONDON",
    ]);

  function fpPlaceBaseKey(p) {
    // Base town name (e.g. "LONDON" from "LONDON, England")
    const name = String((p && p.name) || "").trim();

    // If it has a comma, base is the part before it
    const base = name.split(",")[0].trim();

    // If no name, fall back to slug
    const raw = base || String((p && p.slug) || "").trim();

    // Normalize: uppercase + collapse spaces/punct
    return raw
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s]/g, "")   // remove commas/dots etc
      .trim();
  }


    function fpTypeScore(p) {
      const t = String((p && p.type) || "").toLowerCase();

      // very large regions (e.g. Essex, Greater London) — lowest priority
      if (p && p.count && p.count > 200) return 3;

      if (t.startsWith("town")) return 0;   // best (towns)
      if (t === "district") return 2;       // postcode districts
      return 1;                             // counties / admin areas
    }

  function renderSeo(route) {
    const fuelLabel = route.fuel === "diesel" ? "diesel" : "petrol";
    const placeLabel = route.name;
    const fuelTitle = fuelLabel.charAt(0).toUpperCase() + fuelLabel.slice(1);

   fpLoadPlaces()
   .then((places) => console.log("[SEO] places loaded:", places.length))
   .catch((e) => console.warn("[SEO] places load error:", e));

    // ✅ SAFE: only set if nodes exist (no crashes)
    const h1 = document.getElementById("fpSeoH1");
    if (h1) h1.textContent = `Cheap ${fuelTitle} in ${placeLabel} and nearby`;

    const intro = document.getElementById("fpSeoIntro");
    if (intro) intro.textContent = `Live ${fuelTitle} prices around ${placeLabel}. Pan the map and use “Search this area” to refresh nearby stations.`;

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
      <p>FuelPilot shows <strong>${fuelLabel}</strong> prices on a live map for <strong>${placeLabel}</strong> and nearby areas.</p>
      <p>Pan or zoom, then tap <strong>Search this area</strong> to refresh results for what’s on screen.</p>

      <p><strong>${fuelTitle} near ${placeLabel}</strong>: compare nearby forecourts and find cheaper prices.</p>
      <p>View <strong>${fuelTitle} stations in ${placeLabel}</strong> and check today’s updates.</p>
      <p>See <strong>${fuelTitle} prices in ${placeLabel}</strong> compared with nearby areas.</p>
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

            if (d1 !== d2) return d1 - d2;

            // tie-break: prefer towns over districts
            return fpTypeScore(p1) - fpTypeScore(p2);
          });
        } else {
          candidates.sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""))
          );
        }

        const cluster = [];
        const seen = new Set();
        const currentBase = currentPlace ? fpPlaceBaseKey(currentPlace) : null;

        function pushFrom(list) {
          for (const p of list) {
            if (!p) continue;

          const base = fpPlaceBaseKey(p);

          if (currentBase && base === currentBase) continue;
          if (FP_SEO_BLOCKED_BASES.has(base)) continue;   // ✅ add this
          if (seen.has(base)) continue;

            cluster.push(p);
            seen.add(base);

            if (cluster.length === 8) return true;
          }
          return false;
        }

        const isTownPage = currentPlace && String(currentPlace.type || "").toLowerCase().startsWith("town");

        // Pass 1: always towns first
        pushFrom(candidates.filter(p => fpTypeScore(p) === 0));

        if (cluster.length < 8) {
          if (isTownPage) {
            // On town pages: don't use admin/county/district fallbacks
            // (better to show fewer than add "Essex")
          } else {
            // On district pages: allow non-towns as fallback
            pushFrom(candidates.filter(p => fpTypeScore(p) !== 0));
          }
        }

          let petrolLinks = "";
          let dieselLinks = "";

          console.log("[SEO] cluster size:", cluster.length);

          for (const p of cluster) {
            const slug = p.slug;
            const name = p.name || slug;
            const label = name.split(",")[0];

            const pHref = "/fuel/petrol/" + encodeURIComponent(slug) + "/";
            const dHref = "/fuel/diesel/" + encodeURIComponent(slug) + "/";

        petrolLinks += '<a href="' + pHref + '" data-fp-href="' + pHref + '">' + label + "</a> ";
        dieselLinks += '<a href="' + dHref + '" data-fp-href="' + dHref + '">' + label + "</a> ";
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