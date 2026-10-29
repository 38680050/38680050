#!/usr/bin/env node
/**
 * Aggregate language bytes from:
 * 1) personal public non-fork repos (100% weight)
 * 2) org public repos, weighted by this user's share of additions
 *    (fallback: commit share) via /stats/contributors
 *
 * Usage:
 *   node scripts/generate-my-langs.mjs [username] [org] [outPath] [title]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const USER = process.argv[2] || "38680050";
const ORG = process.argv[3] || "qualitest-hq";
const OUT = process.argv[4] || "assets/my-langs.svg";
const TITLE = process.argv[5] || "My Languages";
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function gh(path, { allow202 = false } = {}) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "38680050-profile-my-langs",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });

    if (allow202 && res.status === 202) {
      await sleep(1500 * attempt);
      continue;
    }

    if (res.status === 204) return null;

    if (!res.ok) {
      throw new Error(`GitHub API ${path} => ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
  return null;
}

async function listRepos(pathBuilder) {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(pathBuilder(page));
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch.filter((r) => !r.fork && !r.archived && !r.private));
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

function addWeightedLangs(totals, langs, weight) {
  if (!langs || weight <= 0) return;
  for (const [name, bytes] of Object.entries(langs)) {
    totals[name] = (totals[name] || 0) + bytes * weight;
  }
}

async function authorWeight(owner, repo, login) {
  const stats = await gh(`/repos/${owner}/${repo}/stats/contributors`, {
    allow202: true,
  });
  if (!Array.isArray(stats) || stats.length === 0) {
    // Stats unavailable — check whether the user has any commits at all
    const commits = await gh(
      `/repos/${owner}/${repo}/commits?author=${encodeURIComponent(login)}&per_page=1`,
    );
    if (Array.isArray(commits) && commits.length > 0) return 1;
    return 0;
  }

  let myAdds = 0;
  let myCommits = 0;
  let allAdds = 0;
  let allCommits = 0;

  for (const row of stats) {
    const adds = (row.weeks || []).reduce((s, w) => s + (w.a || 0), 0);
    const commits = row.total || 0;
    allAdds += adds;
    allCommits += commits;
    if (row.author?.login?.toLowerCase() === login.toLowerCase()) {
      myAdds = adds;
      myCommits = commits;
    }
  }

  if (myCommits <= 0 && myAdds <= 0) return 0;
  if (allAdds > 0) return Math.min(1, myAdds / allAdds);
  if (allCommits > 0) return Math.min(1, myCommits / allCommits);
  return 0;
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

const totals = Object.create(null);
let personalCount = 0;
let orgWeightedCount = 0;

const personalRepos = await listRepos(
  (page) =>
    `/users/${USER}/repos?type=owner&per_page=100&page=${page}&sort=updated`,
);

for (const repo of personalRepos) {
  const langs = await gh(`/repos/${USER}/${repo.name}/languages`);
  addWeightedLangs(totals, langs, 1);
  personalCount += 1;
}

const orgRepos = await listRepos(
  (page) =>
    `/orgs/${ORG}/repos?type=public&per_page=100&page=${page}&sort=updated`,
);

for (const repo of orgRepos) {
  const weight = await authorWeight(ORG, repo.name, USER);
  if (weight <= 0) continue;
  const langs = await gh(`/repos/${ORG}/${repo.name}/languages`);
  addWeightedLangs(totals, langs, weight);
  orgWeightedCount += 1;
  console.log(
    `org ${ORG}/${repo.name}: weight=${(weight * 100).toFixed(1)}%`,
  );
}

const grand = Object.values(totals).reduce((a, b) => a + b, 0);
if (!grand) {
  throw new Error(
    `No language bytes found for ${USER} + ${ORG} contributions`,
  );
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

const sourceLabel = `personal ${personalCount} · ${ORG}×${orgWeightedCount} (author-weighted)`;
const svg = renderSvg(TITLE, ranked, sourceLabel);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg, "utf8");
console.log(
  `Wrote ${OUT}:`,
  ranked.map((r) => `${r.name}=${r.ratio.toFixed(2)}%`).join(", "),
);
