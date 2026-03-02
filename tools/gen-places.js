/**
 * tools/gen-places.js
 * Programmatic SEO place list generator for FuelPilot.
 *
 * Input:
 *   tools/master.json  (your merged master dataset)
 *
 * Output:
 *   public/data/places.json
 *
 * Notes:
 * - Your data has town + postcode in: row.meta.location.city / postcode
 * - This generator creates:
 *     1) town (e.g. "London")
 *     2) town+country (e.g. "London, England")
 *     3) town+county (e.g. "Newport, Gwent") when county exists
 *     4) outward postcode district (e.g. "SW1A", "NR1", "M1")
 */

const fs = require("fs");
const path = require("path");

const INPUT = path.join(__dirname, "master.json");

// Thresholds (tune later)
const MIN_STATIONS_TOWN = 2;        // includes town, town+country, town+county
const MIN_STATIONS_DISTRICT = 3;    // outward postcode district
const MAX_TOWNS = 5000;             // safety caps
const MAX_DISTRICTS = 5000;

const OUT_DIR = path.join(__dirname, "..", "public", "data");
const OUT_FILE = path.join(OUT_DIR, "places.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// UK outward district = part before the space, e.g. "SW1A" from "SW1A 1AA"
function outward(postcode) {
  if (!postcode) return null;
  const pc = String(postcode).trim().toUpperCase();
  const parts = pc.split(/\s+/);
  if (!parts[0]) return null;
  const out = parts[0];
  if (!/\d/.test(out)) return null;            // must have a digit
  if (!/^[A-Z]{1,2}/.test(out)) return null;   // starts with 1-2 letters
  return out;
}

function loc(row) {
  return row && row.meta && row.meta.location ? row.meta.location : null;
}

function pickTown(row) {
  const l = loc(row);
  const t = l && l.city ? String(l.city).trim() : "";
  if (!t || t.length < 2) return null;
  return t;
}

function pickPostcode(row) {
  const l = loc(row);
  const pc = l && l.postcode ? String(l.postcode).trim() : "";
  return pc || null;
}

function pickCountry(row) {
  const l = loc(row);
  const c = l && l.country ? String(l.country).trim() : "";
  if (!c) return null;

  const up = c.toUpperCase();

  // Normalize UK nations
  if (up.includes("ENGLAND")) return "England";
  if (up.includes("SCOTLAND")) return "Scotland";
  if (up.includes("WALES")) return "Wales";
  if (up.includes("NORTHERN IRELAND")) return "Northern Ireland";

  // Sometimes feeds use these
  if (up === "UNITED KINGDOM" || up === "UK" || up === "GREAT BRITAIN") return "UK";

  // Fallback: simple title-case-ish
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

function pickCounty(row) {
  const l = loc(row);
  const c = l && l.county ? String(l.county).trim() : "";
  return c || null;
}

function bump(map, key, name, type) {
  if (!key) return;
  const cur = map.get(key) || { slug: key, name, count: 0, type };
  cur.count += 1;

  // Keep "best" name (longer tends to be more specific)
  if (String(name).length > String(cur.name).length) cur.name = name;

  map.set(key, cur);
}

function main() {
  const data = readJson(INPUT);

  // Your master might be plain array, or wrapped in an object.
  const rows =
    Array.isArray(data) ? data :
    Array.isArray(data.rows) ? data.rows :
    Array.isArray(data.master) ? data.master :
    Array.isArray(data.stations) ? data.stations :
    [];

  if (!rows.length) {
    console.error("Could not find an array of rows in tools/master.json.");
    process.exit(1);
  }

  const townCounts = new Map();
  const districtCounts = new Map();

  for (const r of rows) {
    const town = pickTown(r);
    const country = pickCountry(r);
    const county = pickCounty(r);

    // Town only (e.g. "London")
    if (town) {
      bump(townCounts, slugify(town), town, "town");
    }

    // Town + Country (e.g. "London, England")
    if (town && country) {
      const nm = `${town}, ${country}`;
      bump(townCounts, slugify(`${town}-${country}`), nm, "town_country");
    }

    // Town + County (only where county exists)
    if (town && county) {
      const nm = `${town}, ${county}`;
      bump(townCounts, slugify(`${town}-${county}`), nm, "town_county");
    }

    // Outward postcode district (e.g. SW1A, NR1, M1)
    const pc = pickPostcode(r);
    const out = outward(pc);
    if (out) {
      bump(districtCounts, slugify(out), out, "district");
    }
  }

  const towns = [...townCounts.values()]
    .filter(x => x.count >= MIN_STATIONS_TOWN)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TOWNS);

  const districts = [...districtCounts.values()]
    .filter(x => x.count >= MIN_STATIONS_DISTRICT)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_DISTRICTS);

  const out = {
    builtAt: new Date().toISOString(),
    thresholds: {
      MIN_STATIONS_TOWN,
      MIN_STATIONS_DISTRICT
    },
    counts: {
      inputRows: rows.length,
      towns: towns.length,
      districts: districts.length,
      totalPlaces: towns.length + districts.length
    },
    places: [
      ...towns,
      ...districts
    ]
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  console.log("Wrote:", OUT_FILE);
  console.log("Counts:", out.counts);

  console.log(
    "Top towns:",
    towns.slice(0, 10).map(x => `${x.name} (${x.count})`).join(", ")
  );

  console.log(
    "Top districts:",
    districts.slice(0, 10).map(x => `${x.name} (${x.count})`).join(", ")
  );
}

main();