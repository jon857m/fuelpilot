/**
 * Generate station slug -> node_id map
 *
 * Reads:
 *  - tools/master.json (if present) OR
 *  - data/master.json
 *
 * Writes:
 *  - data/station-slugs.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const INPUT_CANDIDATES = [
  path.join(ROOT, "tools", "master.json"),
  path.join(ROOT, "data", "master.json"),
];

const OUTPUT_FILE = path.join(ROOT, "data", "station-slugs.json");

function findInputFile() {
  for (const p of INPUT_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadArrayJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error(`Expected array in ${p}`);
  return data;
}

function getNodeId(station) {
  return station?.node_id || station?.meta?.node_id || null;
}

function getBrand(station) {
  return (
    station?.meta?.brand_name ||
    station?.brand ||
    station?.meta?.trading_name ||
    station?.trading_name ||
    ""
  );
}

function getCity(station) {
  return station?.meta?.location?.city || "";
}

function getPostcode(station) {
  return station?.meta?.location?.postcode || "";
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function stationSlug(brand, city, postcode) {
  const b = slugify(brand);
  const c = slugify(city);
  const p = slugify(postcode);
  return [b, c, p].filter(Boolean).join("-");
}

function main() {
  const inputPath = findInputFile();
  if (!inputPath) {
    console.error("❌ Could not find master JSON. Looked for:");
    for (const p of INPUT_CANDIDATES) console.error("  - " + p);
    process.exit(1);
  }

  const stations = loadArrayJson(inputPath);

  const map = {};
  let collisions = 0;

  for (const s of stations) {
    const id = getNodeId(s);
    if (!id) continue;

    const slug = stationSlug(getBrand(s), getCity(s), getPostcode(s));
    if (!slug) continue;

    if (map[slug] && map[slug] !== id) {
      // Collision: make it unique by appending short id
      collisions++;
      const short = String(id).slice(0, 8);
      map[`${slug}-${short}`] = id;
      continue;
    }

    map[slug] = id;
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(map, null, 2), "utf8");

  console.log(`✅ Wrote ${Object.keys(map).length} slugs to ${path.relative(ROOT, OUTPUT_FILE)}`);
  console.log(`⚠️ Collisions handled: ${collisions}`);
  console.log(`📥 Source: ${path.relative(ROOT, inputPath)}`);
}

main();