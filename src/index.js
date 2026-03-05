function isLikelyNodeId(s) {
  // node_id is a 64-char hex hash
  return /^[a-f0-9]{64}$/i.test(String(s || ""));
}

function normalizeStationKey(s) {
  return (s || "")
    .trim()
    .replace(/\/+$/, "")   // remove trailing slashes
    .toLowerCase();
}

async function loadStationSlugMap(env, origin) {
  // Cache in memory per isolate
  if (globalThis.__FP_STATION_SLUGS__) return globalThis.__FP_STATION_SLUGS__;

  // Prefer the site-hosted JSON (same pattern as /data/places.json)
  const url = new URL("/data/station-slugs.json", origin).toString();

  const res = await fetch(url, {
    cf: { cacheEverything: true, cacheTtl: 60 * 60 }, // 1 hour edge cache
    headers: { "accept": "application/json" },
  });

  if (!res.ok) {
    globalThis.__FP_STATION_SLUGS__ = null;
    return null;
  }

  const map = await res.json();
  globalThis.__FP_STATION_SLUGS__ = map;
  return map;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ----------------------------
    // Station routes
    // ----------------------------
    if (path.startsWith("/station/")) {
    const stationKeyRaw = decodeURIComponent(path.slice("/station/".length));
    const stationKey = normalizeStationKey(stationKeyRaw);

    if (stationKey && !isLikelyNodeId(stationKey)) {
      const slugMap = await loadStationSlugMap(env, url.origin);
      const nodeId = slugMap?.[stationKey];

      if (nodeId) {
        const location = new URL(`/station/${nodeId}`, url.origin).toString();

        // 301 + cache the redirect at the edge (big scale win)
        return new Response(null, {
          status: 301,
          headers: {
            Location: location,
            "Cache-Control": "public, max-age=86400", // 1 day
          },
        });
      }
    }

      // For now (your existing test response)
      return new Response("Station page test for: " + stationKey, {
        headers: { "content-type": "text/plain" },
      });
    }

    // Default response
    return new Response("FuelPilot Worker is running", {
      headers: { "content-type": "text/plain" },
    });
  },
};