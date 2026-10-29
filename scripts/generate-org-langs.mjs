#!/usr/bin/env node
/**
 * Aggregate language bytes from a GitHub org's public repos and render a compact SVG card.
 * Usage: node scripts/generate-org-langs.mjs [org] [outPath] [title]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ORG = process.argv[2] || "qualitest-hq";
const OUT = process.argv[3] || "assets/qualitest-langs.svg";
const TITLE = process.argv[4] || "Qualitest Languages";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const TOP_N = 6;

const COLORS = {
  Java: "#b07219",
  Vue: "#41b883",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Shell: "#89e051",
  Astro: "#ff5a03",
  Go: "#00ADD8",
  Python: "#3572A5",
  Dockerfile: "#384d54",
  Batchfile: "#C1F12E",
  "Go Template": "#00ADD8",
};

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "38680050-profile-org-langs",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} => ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function listPublicRepos(org) {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(
      `/orgs/${org}/repos?type=public&per_page=100&page=${page}&sort=updated`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch.filter((r) => !r.fork && !r.archived));
    if (batch.length < 100) break;
  }
  return repos;
}

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSvg(title, rows, sourceLabel) {
  const barWidth = 250;
  const barX = 25;
  const barY = 50;
  let x = barX;
  const segments = rows
    .map((row) => {
      const w = Math.max(2, Math.round((row.ratio * barWidth) / 100));
      const seg = `<rect x="${x}" y="${barY}" width="${w}" height="8" fill="${row.color}"/>`;
      x += w;
      return seg;
    })
    .join("\n  ");

  const left = rows.slice(0, 3);
  const right = rows.slice(3, 6);
  const legend = (items, baseX) =>
    items
      .map((row, i) => {
        const y = 80 + i * 22;
        return [
          `<circle cx="${baseX}" cy="${y}" r="5" fill="${row.color}"/>`,
          `<text x="${baseX + 12}" y="${y + 4}" fill="#C9D1D9" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="11">${escapeXml(row.name)} ${row.ratio.toFixed(2)}%</text>`,
        ].join("\n  ");
      })
      .join("\n  ");

  return `<svg width="300" height="165" viewBox="0 0 300 165" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <rect width="300" height="165" rx="4.5" fill="#0D1117"/>
  <text x="25" y="32" fill="#58A6FF" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="18" font-weight="600">${escapeXml(title)}</text>
  <rect x="${barX}" y="${barY}" width="${barWidth}" height="8" rx="4" fill="#161B22"/>
  ${segments}
  ${legend(left, 30)}
  ${legend(right, 165)}
  <text x="25" y="152" fill="#8B949E" font-family="Segoe UI, Ubuntu, Sans-Serif" font-size="10">${escapeXml(sourceLabel)}</text>
</svg>
`;
}

const repos = await listPublicRepos(ORG);
const totals = Object.create(null);

for (const repo of repos) {
  const langs = await gh(`/repos/${ORG}/${repo.name}/languages`);
  for (const [name, bytes] of Object.entries(langs)) {
    totals[name] = (totals[name] || 0) + bytes;
  }
}

const grand = Object.values(totals).reduce((a, b) => a + b, 0);
if (!grand) {
  throw new Error(`No language bytes found for org ${ORG}`);
}

const ranked = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_N)
  .map(([name, bytes]) => ({
    name,
    bytes,
    ratio: (100 * bytes) / grand,
    color: COLORS[name] || "#8B949E",
  }));

const sourceLabel = `from ${ORG} · ${repos.length} public repos · auto`;
const svg = renderSvg(TITLE, ranked, sourceLabel);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg, "utf8");
console.log(
  `Wrote ${OUT}:`,
  ranked.map((r) => `${r.name}=${r.ratio.toFixed(2)}%`).join(", "),
);
