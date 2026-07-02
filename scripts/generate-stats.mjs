// Generates assets/stats-dark.svg and assets/stats-light.svg from the GitHub
// GraphQL API. No dependencies — Node >= 20. Requires GITHUB_TOKEN in env.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOGIN = "manula-sameera";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN is not set");
  process.exit(1);
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

const MONO = `ui-monospace,'Cascadia Code','JetBrains Mono','Fira Code',Consolas,monospace`;
const SANS = `-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

const THEMES = {
  dark: {
    bg: "#050510",
    bg2: "#0a0a18",
    panel: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.12)",
    borderSoft: "rgba(255,255,255,0.08)",
    text: "#f3f1ff",
    text2: "#c8c6e2",
    text3: "#a8a4ce",
    accA: "#c39bff",
    accB: "#7cc1ff",
    orbOpacity: 0.28,
    grainOpacity: 0.05,
  },
  light: {
    bg: "#f7f6fc",
    bg2: "#efedf8",
    panel: "rgba(255,255,255,0.65)",
    border: "rgba(17,16,42,0.14)",
    borderSoft: "rgba(17,16,42,0.09)",
    text: "#11102a",
    text2: "#3f3c60",
    text3: "#6f6b92",
    accA: "#8257d8",
    accB: "#2b7fd9",
    orbOpacity: 0.15,
    grainOpacity: 0.04,
  },
};

async function fetchStats() {
  const query = `query($login: String!) {
    user(login: $login) {
      followers { totalCount }
      contributionsCollection { contributionCalendar { totalContributions } }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes {
          stargazerCount
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }`;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": LOGIN,
    },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const { data, errors } = await res.json();
  if (errors) throw new Error(JSON.stringify(errors));

  const user = data.user;
  const repos = user.repositories.nodes;
  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);

  const EXCLUDED_LANGS = new Set(["CSS", "SCSS", "HTML"]);
  const langBytes = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      if (EXCLUDED_LANGS.has(node.name)) continue;
      const cur = langBytes.get(node.name) ?? { size: 0, color: node.color };
      cur.size += size;
      langBytes.set(node.name, cur);
    }
  }
  const totalBytes = [...langBytes.values()].reduce((s, l) => s + l.size, 0);
  const languages = [...langBytes.entries()]
    .map(([name, { size, color }]) => ({
      name,
      color: color ?? "#8257d8",
      pct: totalBytes ? (size / totalBytes) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  return {
    contributions:
      user.contributionsCollection.contributionCalendar.totalContributions,
    repoCount: user.repositories.totalCount,
    stars,
    followers: user.followers.totalCount,
    languages,
  };
}

function render(t, stats) {
  const W = 1200, H = 268, padX = 48;
  const blocks = [
    [stats.contributions, "contributions / past year"],
    [stats.repoCount, "repositories"],
    [stats.stars, "stars earned"],
    [stats.followers, "followers"],
  ];
  const colW = (W - padX * 2) / blocks.length;

  const statSvg = blocks
    .map(([num, label], i) => {
      const x = padX + colW * i;
      return (
        `<text x="${x}" y="124" font-family="${SANS}" font-size="34" font-weight="700" fill="${t.text}">${num}</text>` +
        `<text x="${x}" y="148" font-family="${MONO}" font-size="12" fill="${t.text3}">${label}</text>`
      );
    })
    .join("\n    ");

  // language bar
  const barY = 184, barH = 10, barW = W - padX * 2;
  let x = padX;
  let barSvg = `<clipPath id="bar"><rect x="${padX}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}"/></clipPath><g clip-path="url(#bar)">`;
  for (const lang of stats.languages) {
    const w = (lang.pct / 100) * barW;
    barSvg += `<rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${lang.color}"/>`;
    x += w;
  }
  barSvg += `<rect x="${x}" y="${barY}" width="${Math.max(0, padX + barW - x)}" height="${barH}" fill="${t.panel}"/></g>`;

  // legend
  let lx = padX;
  const legendSvg = stats.languages
    .map((lang) => {
      const label = `${lang.name} ${lang.pct.toFixed(1)}%`;
      const item =
        `<circle cx="${lx + 5}" cy="${barY + 40}" r="4" fill="${lang.color}"/>` +
        `<text x="${lx + 16}" y="${barY + 44.5}" font-family="${MONO}" font-size="13" fill="${t.text2}">${label}</text>`;
      lx += 16 + label.length * 7.9 + 26;
      return item;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="GitHub stats for ${LOGIN}">
  <defs>
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="16"/></clipPath>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/>
    </linearGradient>
    <radialGradient id="oa" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${t.accA}" stop-opacity="${t.orbOpacity}"/><stop offset="1" stop-color="${t.accA}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ob" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${t.accB}" stop-opacity="${t.orbOpacity}"/><stop offset="1" stop-color="${t.accB}" stop-opacity="0"/>
    </radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="120" cy="${H + 40}" r="300" fill="url(#oa)"/>
    <circle cx="1120" cy="-40" r="320" fill="url(#ob)"/>
    <rect width="${W}" height="${H}" filter="url(#grain)" opacity="${t.grainOpacity}"/>
    <text x="${padX}" y="52" font-family="${MONO}" font-size="13" letter-spacing="2" fill="${t.text3}">02 / GITHUB</text>
    <line x1="${padX}" y1="64" x2="${W - padX}" y2="64" stroke="${t.borderSoft}"/>
    ${statSvg}
    ${barSvg}
    ${legendSvg}
    <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="${t.border}"/>
  </g>
</svg>
`;
}

const stats = await fetchStats();
mkdirSync(OUT, { recursive: true });
for (const key of ["dark", "light"]) {
  writeFileSync(join(OUT, `stats-${key}.svg`), render(THEMES[key], stats));
  console.log(`wrote stats-${key}.svg`);
}
console.log(JSON.stringify(stats, null, 2));
