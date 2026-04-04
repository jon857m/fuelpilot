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

  // Robust station-page hook for layout styling
  const __fpPath = (location.pathname || "").toLowerCase();
  if (__fpPath.startsWith("/station/")) {
    document.body.classList.add("fp-station-page");
  } else {
    document.body.classList.remove("fp-station-page");
  }

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
  // NEW: simple station-page placeholder (safe, removable)
  if (stationKey) {
    let box = document.getElementById("fpStationSeoBox");

    if (!box) {
      box = document.createElement("div");
      box.id = "fpStationSeoBox";

      const isDesktopStationLayout = true;

      box.style.cssText = isDesktopStationLayout
        ? `
            position: relative;
            z-index: 5;
            width: calc(100% - 32px);
            max-width: 1160px;
            margin: 20px auto 22px;
            padding: 14px 16px;
            border-radius: 18px;
            background: linear-gradient(
              180deg,
              rgba(32,36,42,0.82) 0%,
              rgba(18,20,24,0.92) 100%
            );

            border: 1px solid rgba(255,255,255,0.08);

            box-shadow:
              0 12px 30px rgba(0,0,0,0.35),
              inset 0 1px 0 rgba(255,255,255,0.06);

            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            color: #e9eef5;
            box-sizing: border-box;
          `
        : `
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
            box-sizing: border-box;
          `;

      const app = document.querySelector(".fp-app");
      if (app) {
        app.prepend(box);
      } else {
        document.body.prepend(box);
      }
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

    const brandKey = (() => {
    const s = String(meta?.brand_name || "").trim().toLowerCase();
    if (!s) return "";

    if (s.includes("costco")) return "costco";
    if (s.includes("shell")) return "shell";
    if (s.includes("esso")) return "esso";
    if (s.includes("tesco")) return "tesco";
    if (s.includes("asda")) return "asda";
    if (s.includes("bp")) return "bp";
    if (s.includes("morrisons")) return "morrisons";
    if (s.includes("sainsbury")) return "sainsburys";
    if (s.includes("texaco")) return "texaco";
    if (s.includes("gulf")) return "gulf";
    if (s.includes("jet")) return "jet";
    if (s.includes("applegreen")) return "applegreen";
    if (s.includes("spar")) return "spar";

    return "";
  })();

  console.log("[Station brandKey]", meta?.brand_name, "=>", brandKey);

    const brandLogo = brandKey
      ? `<div style="display:flex;justify-content:flex-end;margin-top:-8px;margin-bottom:8px;">
          <img
            src="/assets/brands/${brandKey}.svg"
            alt="${meta?.brand_name || ''}"
            loading="lazy"
            onerror="this.onerror=null;this.src='/assets/brands/${brandKey}.png';"
            style="width:52px;height:22px;display:block;object-fit:contain;opacity:.95"
          >
        </div>`
      : "";

    // phone / opening / amenities (from meta)
    const phone =
      (meta?.public_phone_number || s?.public_phone_number || "").toString().trim();

          // Exact station detail handoff for the map app
    window.__FP_STATION_DETAIL__ = {
      id: String(stationKeyLower || "").trim(),
      nodeId: String(stationIdFromPath || "").trim(),
      name: (meta?.trading_name || s?.trading_name || meta?.brand_name || "Fuel station").toString().trim(),
      brand: (meta?.brand_name || "").toString().trim(),
      addressShort: [
        (loc?.address_line_1 || "").toString().trim(),
        (loc?.postcode || "").toString().trim()
      ].filter(Boolean).join(", "),
      postcode: (loc?.postcode || "").toString().trim(),
      lat: Number(loc?.latitude),
      lng: Number(loc?.longitude),
      fuel_prices: Array.isArray(s?.fuel_prices) ? s.fuel_prices : [],
      raw: s
    };

    console.log("[Station SEO] published exact station detail:", window.__FP_STATION_DETAIL__);

    window.dispatchEvent(
      new CustomEvent("fp:station-detail-ready", {
        detail: window.__FP_STATION_DETAIL__
      })
    );

       renderStationSeo(window.__FP_STATION_DETAIL__);

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


    function formatFuelLabel(fuelType) {
    const ft = String(fuelType || "").trim().toUpperCase();

    if (ft === "E10") return "Petrol";
    if (ft === "E5") return "Premium Petrol";
    if (ft === "DIESEL" || ft === "B7_STANDARD") return "Diesel";
    if (ft === "B7_PREMIUM") return "Premium Diesel";

    return String(fuelType || "").trim();
  }

    // prices
    const prices = Array.isArray(s?.fuel_prices) ? s.fuel_prices : [];
    const fuelOrder = ["E10", "E5", "B7_STANDARD", "B7_PREMIUM"];

    const priceLines = prices
      .slice()
      .sort((a, b) => {
        const ai = fuelOrder.indexOf(String(a?.fuel_type || "").toUpperCase());
        const bi = fuelOrder.indexOf(String(b?.fuel_type || "").toUpperCase());

        const ax = ai === -1 ? 999 : ai;
        const bx = bi === -1 ? 999 : bi;

        return ax - bx;
      })
      .map(p => {
        const fuelLabel = formatFuelLabel(p.fuel_type);
        const pr = (p.price ?? "").toString();

        return `<div style="display:flex;justify-content:space-between;gap:10px;">
          <span style="opacity:0.8">${fuelLabel}</span>
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
      ? `<div style="opacity:0.85;font-size:13px; margin-top:10px;">Phone: <a href="tel:${phone.replace(/\s+/g, "")}" style="color:#e9eef5;text-decoration:none;font-weight:700;">${phone}</a></div>`
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

            priceRange: prices.length
            ? `£${(Math.min(...prices.map(p => p.price)) / 100).toFixed(2)} - £${(Math.max(...prices.map(p => p.price)) / 100).toFixed(2)}`
            : undefined,

            currenciesAccepted: "GBP",
            paymentAccepted: "Cash, Credit Card, Debit Card"


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
          ${brandLogo}
          ${openingHtml}
          ${amenitiesHtml}
        </div>
        </div>
      <div class="fp-st-cta" style="display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex-shrink:0;">

        <span
          aria-disabled="true"
          title="Station claim tools coming soon"
          style="display:inline-flex;align-items:center;gap:8px;
            padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.18);
            background:rgba(255,255,255,0.08);color:#e9eef5;font-weight:800;opacity:0.9;cursor:default;">
          Coming soon: Claim this station
        </span>

        <a href="/?lat=${encodeURIComponent(Number(loc?.latitude || 0).toFixed(5))}&lng=${encodeURIComponent(Number(loc?.longitude || 0).toFixed(5))}&zoom=15&fuel=E10"
          title="Back to the main map centred on this station"
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


    `;

    let nearbyBlock = document.getElementById("fpStationNearbyBlock");

      if (!nearbyBlock) {
        nearbyBlock = document.createElement("div");
        nearbyBlock.id = "fpStationNearbyBlock";
      }

      nearbyBlock.style.cssText = `
        width: calc(100% - 32px);
        max-width: 1160px;
        margin: 18px auto 0;
        padding: 14px 16px;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.08);
        background: linear-gradient(
          180deg,
          rgba(32,36,42,0.82) 0%,
          rgba(18,20,24,0.92) 100%
        );
        box-shadow:
          0 12px 30px rgba(0,0,0,0.35),
          inset 0 1px 0 rgba(255,255,255,0.06);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        color: #e9eef5;
        box-sizing: border-box;
      `;

      nearbyBlock.innerHTML = `
        <div style="font-weight:800;margin-bottom:10px;">Other nearby fuel stations</div>
        <div class="fp-nearby-list">
          ${nearbyHtml || `<div style="opacity:0.7;font-size:13px;">No nearby stations found.</div>`}
        </div>
      `;

      const mapWrap = document.querySelector(".fp-map-wrap");
      if (mapWrap && mapWrap.parentNode) {
        mapWrap.insertAdjacentElement("afterend", nearbyBlock);
      }
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
    const cleanedBase = base
    .replace(/^NR\s+/i, "")
    .replace(/^NEAR\s+/i, "")
    .trim();

// If no name, fall back to slug
const raw = cleanedBase || String((p && p.slug) || "").trim();

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

      function getSeoEls() {
    const section = document.getElementById("fpSeo");
    const h1 = document.getElementById("fpSeoH1");
    const intro = document.getElementById("fpSeoIntro");
    const stats = document.getElementById("fpSeoStats");
    const body = document.getElementById("fpSeoBody");

    if (!section || !h1 || !intro || !stats || !body) return null;

    return { section, h1, intro, stats, body };
  }

  function renderSeoScaffold(opts) {
    const els = getSeoEls();
    if (!els) return null;

    const {
      heading = "Fuel prices",
      introText = "",
      statItems = []
    } = opts || {};

    els.h1.textContent = heading;
    els.intro.textContent = introText;

    els.stats.innerHTML = Array.isArray(statItems)
      ? statItems.map((txt) => `<div>${txt}</div>`).join("")
      : "";

    els.body.innerHTML = "";

    return els;
  }


  function renderStationSeo(detail) {
    if (!detail) return;

    const lat = Number(detail.lat);
    const lng = Number(detail.lng);
    if (!isFinite(lat) || !isFinite(lng)) return;

    const raw = detail.raw || {};
    const meta = raw.meta || {};
    const loc = meta.location || {};
    const prices = Array.isArray(raw.fuel_prices) ? raw.fuel_prices : [];

    const brand = String(detail.brand || meta.brand_name || "").trim();
    const name = String(detail.name || meta.trading_name || raw.trading_name || brand || "Fuel station").trim();
    const line1 = String(loc.address_line_1 || "").trim();
    const town = String(loc.city || "").trim();
    const postcode = String(loc.postcode || detail.postcode || "").trim();
    const phone = String(meta.public_phone_number || raw.public_phone_number || "").trim();

    const usualDays = meta.opening_times && meta.opening_times.usual_days
      ? meta.opening_times.usual_days
      : null;

    const amenities = Array.isArray(meta.amenities) ? meta.amenities : [];

    function esc(v) {
      return String(v == null ? "" : v)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function formatFuelLabel(ft) {
      const s = String(ft || "").trim().toUpperCase();
      if (s === "E10") return "Petrol";
      if (s === "E5") return "Premium Petrol";
      if (s === "DIESEL" || s === "B7_STANDARD") return "Diesel";
      if (s === "B7_PREMIUM") return "Premium Diesel";
      return String(ft || "").trim();
    }

    function formatPrice(v) {
      if (v == null || v === "") return "";
      const n = Number(v);
      if (!isFinite(n)) return String(v);
      if (n > 300) return (n / 10).toFixed(1) + "p";
      return n.toFixed(1) + "p";
    }

    function prettifyAmenity(a) {
      const map = {
        adblue_packaged: "AdBlue",
        customer_toilets: "Toilets",
        water_filling: "Water"
      };
      const rawAmenity = String(a || "").trim();
      if (!rawAmenity) return "";
      if (map[rawAmenity]) return map[rawAmenity];
      return rawAmenity
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/(^|\\s)\\S/g, function (c) { return c.toUpperCase(); });
    }

    function formatDayHours(dayObj) {
      if (!dayObj) return "—";
      if (dayObj.is_24_hours) return "Open 24h";
      const o = String(dayObj.open || "").slice(0, 5);
      const c = String(dayObj.close || "").slice(0, 5);
      if (!o || !c || (o === "00:00" && c === "00:00")) return "—";
      return o + "–" + c;
    }

    const addressBits = [line1, town, postcode].filter(Boolean);
    const addressLine = addressBits.join(", ");

    const orderedPrices = prices
      .slice()
      .sort((a, b) => {
        const order = ["E10", "E5", "B7_STANDARD", "B7_PREMIUM"];
        const ai = order.indexOf(String(a && a.fuel_type || "").toUpperCase());
        const bi = order.indexOf(String(b && b.fuel_type || "").toUpperCase());
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

    let priceHtml = "";
    if (orderedPrices.length) {
      priceHtml = orderedPrices.map(function (p) {
        return `
          <div style="display:flex;justify-content:space-between;gap:12px;">
            <span>${esc(formatFuelLabel(p.fuel_type))}</span>
            <strong>${esc(formatPrice(p.price))}</strong>
          </div>
        `;
      }).join("");
    } else {
      priceHtml = `<p>No current prices available for this station.</p>`;
    }

    let openingHtml = "";
    if (usualDays) {
      const days = [
        ["Mon", "monday"],
        ["Tue", "tuesday"],
        ["Wed", "wednesday"],
        ["Thu", "thursday"],
        ["Fri", "friday"],
        ["Sat", "saturday"],
        ["Sun", "sunday"]
      ];

      openingHtml = `
        <h3>Opening hours</h3>
        <div style="display:grid;gap:6px;">
          ${days.map(function (pair) {
            return `
              <div style="display:flex;justify-content:space-between;gap:12px;">
                <span>${pair[0]}</span>
                <strong>${esc(formatDayHours(usualDays[pair[1]]))}</strong>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    let amenitiesHtml = "";
    const amenityList = amenities.map(prettifyAmenity).filter(Boolean).slice(0, 12);
    if (amenityList.length) {
      amenitiesHtml = `
        <h3>Facilities</h3>
        <p>${amenityList.map(esc).join(" • ")}</p>
      `;
    }

    fpLoadPlaces().then((places) => {
      let placeLabel = town || postcode || "nearby";

      if (Array.isArray(places) && places.length) {
        let currentPlace = null;
        let bestKm = Infinity;

        for (const p of places) {
          if (!p || !p.slug) continue;

          const pLat = Number(p.lat);
          const pLng = Number(p.lng);
          if (!isFinite(pLat) || !isFinite(pLng)) continue;

          const km = fpKmBetween(lat, lng, pLat, pLng);
          if (km < bestKm) {
            bestKm = km;
            currentPlace = p;
          }
        }

        if (currentPlace) {
          placeLabel = String(currentPlace.name || currentPlace.slug || placeLabel).split(",")[0].trim();
        }
      }

      const els = renderSeoScaffold({
        heading: `${esc(name)}${town ? `, ${esc(town)}` : ""}${postcode ? ` (${esc(postcode)})` : ""}`,
        introText: `Live fuel prices, address details and opening times for ${name}${placeLabel ? ` in ${placeLabel}` : ""}.`,
        statItems: [
          brand || "Fuel station",
          postcode || "UK station",
          orderedPrices.length ? `${orderedPrices.length} fuel price${orderedPrices.length === 1 ? "" : "s"}` : "No live prices"
        ]
      });

      const body = els && els.body;
      if (!body) return;

          fpLoadPlaces()
      .then((places) => {
        if (!Array.isArray(places)) return;

        let currentPlace = null;
        let bestKm = Infinity;

        for (const p of places) {
          if (!p || !p.slug) continue;

          const pLat = Number(p.lat);
          const pLng = Number(p.lng);
          if (!isFinite(pLat) || !isFinite(pLng)) continue;

          const km = fpKmBetween(lat, lng, pLat, pLng);
          if (km < bestKm) {
            bestKm = km;
            currentPlace = p;
          }
        }

        if (!currentPlace) return;

        const currentSlug = currentPlace.slug || "";
        const aLat = Number(currentPlace.lat);
        const aLng = Number(currentPlace.lng);

        let candidates = places.filter((p) => {
          if (!p || !p.slug || p.slug === currentSlug) return false;
          const pLat = Number(p.lat);
          const pLng = Number(p.lng);
          return isFinite(pLat) && isFinite(pLng);
        });

        if (isFinite(aLat) && isFinite(aLng)) {
          candidates.sort((p1, p2) => {
            const d1 = fpKmBetween(aLat, aLng, Number(p1.lat), Number(p1.lng));
            const d2 = fpKmBetween(aLat, aLng, Number(p2.lat), Number(p2.lng));

            if (d1 !== d2) return d1 - d2;
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
            if (FP_SEO_BLOCKED_BASES.has(base)) continue;
            if (seen.has(base)) continue;

            cluster.push(p);
            seen.add(base);

            if (cluster.length === 8) return true;
          }
          return false;
        }

        const isTownPage =
          currentPlace &&
          String(currentPlace.type || "").toLowerCase().startsWith("town");

        pushFrom(candidates.filter((p) => fpTypeScore(p) === 0));

        if (cluster.length < 8) {
          if (!isTownPage) {
            pushFrom(candidates.filter((p) => fpTypeScore(p) !== 0));
          }
        }

        let petrolLinks = "";
        let dieselLinks = "";

        for (const p of cluster) {
          const slug = p.slug;
          const name = p.name || slug;
          const label = name
            .split(",")[0]
            .replace(/^NR\s+/i, "")
            .replace(/^NEAR\s+/i, "")
            .trim();

          const petrolHref = "/fuel/petrol/" + encodeURIComponent(slug) + "/";
          const dieselHref = "/fuel/diesel/" + encodeURIComponent(slug) + "/";

          petrolLinks += `<a href="${petrolHref}" data-fp-href="${petrolHref}">${label}</a> `;
          dieselLinks += `<a href="${dieselHref}" data-fp-href="${dieselHref}">${label}</a> `;
        }

        body.insertAdjacentHTML(
          "beforeend",
          `
            <div class="fp-seo-cluster">
              <h3>Nearby petrol pages</h3>
              <div class="fp-seo-links">${petrolLinks}</div>

              <h3 style="margin-top:14px;">Nearby diesel pages</h3>
              <div class="fp-seo-links">${dieselLinks}</div>
            </div>
          `
        );

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
      .catch((e) => {
        console.warn("[Station SEO] cluster build failed", e);
      });

      body.innerHTML = `
        <p><strong>${esc(name)}</strong>${brand && brand !== name ? ` is a ${esc(brand)} station` : " is a fuel station"}${addressLine ? ` at <strong>${esc(addressLine)}</strong>` : ""}.</p>

        ${phone ? `<p><strong>Phone:</strong> <a href="tel:${esc(phone.replace(/\\s+/g, ""))}">${esc(phone)}</a></p>` : ""}

        <h3>Current prices</h3>
        <div style="display:grid;gap:6px;">${priceHtml}</div>

        ${openingHtml}

        ${amenitiesHtml}

        <h3>Station summary</h3>
        <p>Use FuelPilot to compare this station with nearby forecourts, check live prices and view the station on the map.</p>
      `;
    });
  }

  function renderSeo(route) {
    const fuelLabel = route.fuel === "diesel" ? "diesel" : "petrol";
    const placeLabel = route.name;
    const fuelTitle = fuelLabel.charAt(0).toUpperCase() + fuelLabel.slice(1);

   fpLoadPlaces()
   .then((places) => console.log("[SEO] places loaded:", places.length))
   .catch((e) => console.warn("[SEO] places load error:", e));

    // ✅ SAFE: only set if nodes exist (no crashes)
    const els = renderSeoScaffold({
      heading: `Cheap ${fuelTitle} in ${placeLabel} and nearby`,
      introText: `Live ${fuelTitle} prices around ${placeLabel}. Pan the map and use “Search this area” to refresh nearby stations.`,
      statItems: ["Map-first", "Compare nearby areas", "Fast to use"]
    });

    const body = els && els.body;
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