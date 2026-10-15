// _worker.js — HTs Collections
// Handles:
//   - /htc1 … /htc5 (album SSR page with SEO meta)
//   - /robots.txt
//   - /sitemap.xml (auto-generated from data.json, cached 30 min)
// Falls back to env.ASSETS for everything else.

const CANONICAL         = "https://htcoll.shop";
const FALLBACK_OG_IMAGE = "https://hyperproduction.co.za/logo/fb-thumb.png";

export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ─────────────────────────────────────────────
    // robots.txt
    // ─────────────────────────────────────────────
    if (path === "/robots.txt") {
      return new Response(robotsTxt(CANONICAL), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    // ─────────────────────────────────────────────
    // sitemap.xml (cached)
    // ─────────────────────────────────────────────
    if (path === "/sitemap.xml") {
      const cache    = caches.default;
      const cacheKey = new Request(`${CANONICAL}/sitemap.xml`, request);

      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      const xml = await buildSitemap(url.origin, env);
      const res = new Response(xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=1800"
        }
      });

      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    // ─────────────────────────────────────────────
    // Album pages: /htc1 … /htc5
    // ─────────────────────────────────────────────
    const match = path.match(/^\/(htc[1-5])\/?$/);
    if (match) {
      return renderAlbumPage(request, env, match[1]);
    }

    // ─────────────────────────────────────────────
    // Everything else → static assets
    // ─────────────────────────────────────────────
    return env.ASSETS.fetch(request);
  }
};

// ─────────────────────────────────────────────
// Album page SSR
// ─────────────────────────────────────────────
async function renderAlbumPage(request, env, albumId) {
  const url = new URL(request.url);

  const shell = await env.ASSETS.fetch(new URL("/", url.origin));
  const html  = await shell.text();

  const dataRes = await env.ASSETS.fetch(new URL("/data.json", url.origin));
  const data    = await dataRes.json();

  const allAlbums = [...(data.albums || []), data.comingSoonAlbum].filter(Boolean);
  const album     = allAlbums.find(a => a.id === albumId);

  if (!album) return new Response("Album not found", { status: 404 });

  const cover     = `${data.baseUrl}/images/${album.cover}`;
  const pageUrl   = `${CANONICAL}/${albumId}`;
  const pageTitle = `${album.title} — ${album.artist} | HTs Collections`;
  const dateLine  = album.releaseDate
    ? `Released ${album.releaseDate}.`
    : `Released ${album.year}.`;
  const description = `${album.title} by ${album.artist}. ${album.tracks.length} tracks. ${dateLine} Stream on HTs Collections.`;

  const tracklistText = (album.tracks || []).map((t, i) => {
    const mix = t.mix ? ` (${t.mix})` : "";
    return `${i + 1}. ${t.artist} - ${t.title}${mix}`;
  }).join("\n");

  const hiddenBlock = `
<div style="display:none" aria-hidden="true">
${album.title} — ${album.artist} (${album.year})
${album.tracks.length} tracks. ${dateLine}
Tracklist:
${tracklistText}
</div>`;

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(pageTitle); } })
    .on('meta[name="description"]', {
      element(el) { el.setAttribute("content", description); }
    })
    .on('link[rel="canonical"]', {
      element(el) { el.setAttribute("href", pageUrl); }
    })
    .on('meta[property="og:title"]', {
      element(el) { el.setAttribute("content", pageTitle); }
    })
    .on('meta[property="og:description"]', {
      element(el) { el.setAttribute("content", description); }
    })
    .on('meta[property="og:image"]', {
      element(el) { el.setAttribute("content", cover); }
    })
    .on('meta[property="og:url"]', {
      element(el) { el.setAttribute("content", pageUrl); }
    })
    .on('meta[name="twitter:title"]', {
      element(el) { el.setAttribute("content", pageTitle); }
    })
    .on('meta[name="twitter:description"]', {
      element(el) { el.setAttribute("content", description); }
    })
    .on('meta[name="twitter:image"]', {
      element(el) { el.setAttribute("content", cover); }
    })
    .on("body", { element(el) { el.append(hiddenBlock, { html: true }); } })
    .transform(new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }));
}

// ─────────────────────────────────────────────
// robots.txt
// ─────────────────────────────────────────────
function robotsTxt(origin) {
  return `User-agent: *
Allow: /

# Let Google render JS for the SPA
Sitemap: ${origin}/sitemap.xml
`.trim() + "\n";
}

// ─────────────────────────────────────────────
// sitemap.xml
// ─────────────────────────────────────────────
async function buildSitemap(origin, env) {
  const url = new URL(origin);

  let data = { albums: [], comingSoonAlbum: null };
  try {
    const r = await env.ASSETS.fetch(new URL("/data.json", url.origin));
    if (r.ok) data = await r.json();
  } catch (e) {
    console.error("sitemap: data.json fetch failed:", e);
  }

  const allAlbums = [
    ...(data.albums || []),
    data.comingSoonAlbum
  ].filter(Boolean);

  // Static entries
  const staticEntries = [
    { loc: "/", priority: "1.0", changefreq: "weekly" }
  ];

  // Album entries — one per /htcN
  const albumEntries = allAlbums.map(a => {
    const cover = a.cover
      ? `${data.baseUrl}/images/${a.cover}`
      : FALLBACK_OG_IMAGE;
    return {
      loc: `/${a.id}`,
      priority: "0.9",
      changefreq: "monthly",
      image: cover,
      imageTitle: `${a.title} — ${a.artist}`
    };
  });

  const all = [...staticEntries, ...albumEntries];

  const urls = all.map(e => {
    const parts = [`    <loc>${escapeXml(origin + e.loc)}</loc>`];
    if (e.lastmod)    parts.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
    if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority)   parts.push(`    <priority>${e.priority}</priority>`);
    if (e.image) {
      parts.push(`    <image:image>`);
      parts.push(`      <image:loc>${escapeXml(e.image)}</image:loc>`);
      if (e.imageTitle) {
        parts.push(`      <image:title>${escapeXml(e.imageTitle)}</image:title>`);
      }
      parts.push(`    </image:image>`);
    }
    return `  <url>\n${parts.join("\n")}\n  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
