#!/usr/bin/env node
/**
 * Patch Total Stars Earned on stats.svg to include org public repos.
 * Default affiliations: personal OWNER + ORGANIZATION_MEMBER (non-fork, public).
 *
 * Usage: node scripts/patch-stats-stars.mjs [username] [statsSvgPath]
 */
import { readFileSync, writeFileSync } from "node:fs";

const USER = process.argv[2] || "38680050";
const SVG_PATH = process.argv[3] || "assets/stats.svg";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const EXTRA_ORGS = (process.env.STATS_STAR_ORGS || "qualitest-hq")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function ghJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "38680050-profile-patch-stars",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${url} => ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function listPublicStars(pathBuilder) {
  let total = 0;
  const detail = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await ghJson(
      `https://api.github.com${pathBuilder(page)}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const repo of batch) {
      if (repo.fork || repo.archived || repo.private) continue;
      total += repo.stargazers_count || 0;
      if (repo.stargazers_count) {
        detail.push(`${repo.full_name}:${repo.stargazers_count}`);
      }
    }
    if (batch.length < 100) break;
  }
  return { total, detail };
}

const personal = await listPublicStars(
  (page) =>
    `/users/${USER}/repos?type=owner&per_page=100&page=${page}&sort=updated`,
);

let orgTotal = 0;
const orgDetail = [];
for (const org of EXTRA_ORGS) {
  const part = await listPublicStars(
    (page) =>
      `/orgs/${org}/repos?type=public&per_page=100&page=${page}&sort=updated`,
  );
  orgTotal += part.total;
  orgDetail.push(...part.detail);
}

const stars = personal.total + orgTotal;
console.log(
  `stars=${stars} (personal=${personal.total}, orgs=${orgTotal})`,
  [...personal.detail, ...orgDetail].join(", "),
);

let svg = readFileSync(SVG_PATH, "utf8");
const before = svg;

svg = svg.replace(
  /Total Stars Earned:\s*\d+/,
  `Total Stars Earned: ${stars}`,
);
svg = svg.replace(
  /(data-testid="stars"\s*>)(\d+)(<\/text>)/,
  `$1${stars}$3`,
);

if (svg === before) {
  throw new Error(`Failed to patch star count in ${SVG_PATH}`);
}

writeFileSync(SVG_PATH, svg, "utf8");
console.log(`Patched ${SVG_PATH} -> Total Stars Earned: ${stars}`);
