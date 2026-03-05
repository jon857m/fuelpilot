// tools/gen-station-sitemap.js
// Generates sitemap-stations.xml from data/station-slugs.json

import fs from "fs";
import path from "path";

const SITE = "https://fuelpilot.co.uk"; // change if needed
const SLUGS_PATH = path.join(process.cwd(), "data", "station-slugs.json");
const OUT_PATH = path.join(process.cwd(), "sitemap-stations.xml");

function escXml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function todayISO() {
  // YYYY-MM-DD
  return new Date().toISOString().slice(0, 10);
}

function main() {
  if (!fs.existsSync(SLUGS_PATH)) {
    console.error(`❌ Missing ${SLUGS_PATH}`);
    console.error(`   Run your slug generation step first (station-slugs.json).`);
    process.exit(1);
  }

  const slugMap = JSON.parse(fs.readFileSync(SLUGS_PATH, "utf8"));
  const slugs = Object.keys(slugMap).sort();

  const lastmod = todayISO();

  const urls = slugs
    .map((slug) => {
      const loc = `${SITE}/station/${encodeURIComponent(slug)}`;
      return [
        "  <url>",
        `    <loc>${escXml(loc)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        "    <changefreq>daily</changefreq>",
        "    <priority>0.7</priority>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");

  fs.writeFileSync(OUT_PATH, xml, "utf8");

  console.log(`✅ Wrote ${slugs.length} station URLs to ${OUT_PATH}`);
  console.log(`🔗 Example: ${SITE}/station/${slugs[0]}`);
}

main();