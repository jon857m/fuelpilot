/**
 * tools/gen-sitemap.js
 * Reads public/data/places.json and writes sitemap.xml
 */
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://fuelpilot.co.uk"; // change if needed
const PLACES_FILE = path.join(__dirname, "..", "public", "data", "places.json");
const OUT_FILE = path.join(__dirname, "..", "sitemap.xml");

// We’re shipping petrol pages first (safer).
const FUEL = "petrol";

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function main() {
  const raw = JSON.parse(fs.readFileSync(PLACES_FILE, "utf8"));
  const places = raw.places || [];
  const today = new Date().toISOString().slice(0, 10);

  const urls = [];

  // Optional: include homepage
  urls.push({
    loc: `${BASE_URL}/`,
    lastmod: today,
    changefreq: "daily",
    priority: "1.0",
  });

  // Generate petrol pages
  for (const p of places) {
    if (!p || !p.slug) continue;
    const loc = `${BASE_URL}/fuel/${FUEL}/${p.slug}/`;
    urls.push({
      loc,
      lastmod: today,
      changefreq: "daily",
      priority: "0.6",
    });
  }

  const body = urls
    .map(
      (u) => [
        "  <url>",
        `    <loc>${xmlEscape(u.loc)}</loc>`,
        `    <lastmod>${u.lastmod}</lastmod>`,
        `    <changefreq>${u.changefreq}</changefreq>`,
        `    <priority>${u.priority}</priority>`,
        "  </url>",
      ].join("\n")
    )
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    body +
    `\n</urlset>\n`;

  fs.writeFileSync(OUT_FILE, xml, "utf8");

  console.log("Wrote:", OUT_FILE);
  console.log("URL count:", urls.length);
}

main();