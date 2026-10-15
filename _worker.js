// _worker.js — Hyper Production (SA) Store
// Handles:
//   - HTML shell + SEO meta injection (/, /shop, /category/:name, /product/:slug, /checkout, /track)
//   - /robots.txt
//   - /sitemap.xml (auto-generated from index.json, cached 30 min)
// Falls back to env.ASSETS for everything else.

const CANONICAL         = "https://store.hyperproduction.co.za";
const CDN_BASE          = "https://cdn.hyperproduction.co.za/store";
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

      const xml = await buildSitemap(CANONICAL);
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
    // Route detection for SSR meta injection
    // ─────────────────────────────────────────────
    if (request.method !== "GET" && request.method !== "HEAD") {
      return env.ASSETS.fetch(request);
    }

    const productMatch  = path.match(/^\/product\/([^/]+)\/?$/);
    const categoryMatch = path.match(/^\/category\/([^/]+)\/?$/);
    const isHome        = path === "/" || path === "";
    const isShop        = path === "/shop" || path === "/shop/";
    const isCheckout    = path === "/checkout" || path === "/checkout/";
    const isCheckoutOk  = path === "/checkout/success" || path === "/checkout/success/";
    const isTrack       = path === "/track" || path === "/track/";

    const needsSsr =
      isHome || isShop || isCheckout || isCheckoutOk || isTrack ||
      productMatch || categoryMatch;

    if (!needsSsr) {
      return env.ASSETS.fetch(request);
    }

    // ─────────────────────────────────────────────
    // Fetch shell + index.json
    // ─────────────────────────────────────────────
    const shellRes = await env.ASSETS.fetch(new URL("/index.html", url.origin));
    const shell    = await shellRes.text();

    let index = { products: [], categories: [] };
    try {
      const r = await fetch(`${CDN_BASE}/index.json`, {
        cf: { cacheTtl: 300, cacheEverything: true }
      });
      if (r.ok) index = await r.json();
    } catch (e) {
      console.error("index.json fetch failed:", e);
    }

    const products   = index.products || [];
    const categories = index.categories || [];
    const bySlug     = Object.fromEntries(products.map(p => [p.slug, p]));

    // ─────────────────────────────────────────────
    // Build SEO payload per route
    // ─────────────────────────────────────────────
    let seo;

    if (isHome) {
      seo = {
        title: "Shop | Hyper Production (SA)",
        description:
          "Official store for Hyper Production (SA). Afro House apparel, merch, and releases — shipped across South Africa and worldwide.",
        canonical: `${CANONICAL}/`,
        image: FALLBACK_OG_IMAGE,
        hidden: null
      };
    } else if (isShop) {
      seo = {
        title: "All Products | Hyper Production (SA) Store",
        description:
          `Browse all ${products.length} products in the Hyper Production (SA) store — apparel, merch, and more.`,
        canonical: `${CANONICAL}/shop`,
        image: FALLBACK_OG_IMAGE,
        hidden: products.map(p => `- ${p.title} (${formatZar(p.price)})`).join("\n")
      };
    } else if (categoryMatch) {
      const cat  = decodeURIComponent(categoryMatch[1]);
      const list = products.filter(p => p.category === cat);
      seo = {
        title: `${cat} | Hyper Production (SA) Store`,
        description:
          `${list.length} ${cat.toLowerCase()} products in the Hyper Production (SA) store.`,
        canonical: `${CANONICAL}/category/${encodeURIComponent(cat)}`,
        image: FALLBACK_OG_IMAGE,
        hidden: list.map(p => `- ${p.title} (${formatZar(p.price)})`).join("\n")
      };
    } else if (productMatch) {
      const slug    = decodeURIComponent(productMatch[1]);
      const product = bySlug[slug];

      if (!product) {
        seo = {
          title: "Product Not Found | Hyper Production (SA) Store",
          description: "The product you were looking for could not be found.",
          canonical: `${CANONICAL}/product/${encodeURIComponent(slug)}`,
          image: FALLBACK_OG_IMAGE,
          hidden: null
        };
      } else {
        const image   = product.hero || FALLBACK_OG_IMAGE;
        const summary = stripHtml(product.summary || "");
        seo = {
          title: `${product.title} | Hyper Production (SA) Store`,
          description:
            `${summary} ${formatZar(product.price)}. Ships across South Africa.`,
          canonical: `${CANONICAL}/product/${encodeURIComponent(slug)}`,
          image,
          hidden: buildProductHidden(product)
        };
      }
    } else if (isCheckoutOk) {
      seo = {
        title: "Order Confirmed | Hyper Production (SA) Store",
        description: "Your order has been confirmed. We'll email you when it ships.",
        canonical: `${CANONICAL}/checkout/success`,
        image: FALLBACK_OG_IMAGE,
        hidden: null
      };
    } else if (isCheckout) {
      seo = {
        title: "Checkout | Hyper Production (SA) Store",
        description: "Secure checkout for Hyper Production (SA) merch orders.",
        canonical: `${CANONICAL}/checkout`,
        image: FALLBACK_OG_IMAGE,
        hidden: null
      };
    } else if (isTrack) {
      seo = {
        title: "Track Your Order | Hyper Production (SA) Store",
        description: "Enter your order reference to check its current status.",
        canonical: `${CANONICAL}/track`,
        image: FALLBACK_OG_IMAGE,
        hidden: null
      };
    }

    // ─────────────────────────────────────────────
    // Rewrite shell with SEO tags
    // ─────────────────────────────────────────────
    const rewritten = new HTMLRewriter()
      .on("title", { element(el) { el.setInnerContent(seo.title); } })
      .on('meta[name="description"]', {
        element(el) { el.setAttribute("content", seo.description); }
      })
      .on('link[rel="canonical"]', {
        element(el) { el.setAttribute("href", seo.canonical); }
      })
      .on('meta[property="og:title"]', {
        element(el) { el.setAttribute("content", seo.title); }
      })
      .on('meta[property="og:description"]', {
        element(el) { el.setAttribute("content", seo.description); }
      })
      .on('meta[property="og:image"]', {
        element(el) { el.setAttribute("content", seo.image); }
      })
      .on('meta[property="og:url"]', {
        element(el) { el.setAttribute("content", seo.canonical); }
      })
      .on('meta[name="twitter:title"]', {
        element(el) { el.setAttribute("content", seo.title); }
      })
      .on('meta[name="twitter:description"]', {
        element(el) { el.setAttribute("content", seo.description); }
      })
      .on('meta[name="twitter:image"]', {
        element(el) { el.setAttribute("content", seo.image); }
      })
      .on("body", {
        element(el) {
          if (seo.hidden) {
            el.append(
              `<div style="display:none" aria-hidden="true">\n${escapeHtml(seo.hidden)}\n</div>`,
              { html: true }
            );
          }
        }
      })
      .transform(new Response(shell, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      }));

    return rewritten;
  }
};

// ─────────────────────────────────────────────
// robots.txt
// ─────────────────────────────────────────────
function robotsTxt(origin) {
  return `User-agent: *
Allow: /

# Don't waste crawl budget on these
Disallow: /checkout
Disallow: /cart

# Let Google render JS for the SPA
Sitemap: ${origin}/sitemap.xml
`.trim() + "\n";
}

// ─────────────────────────────────────────────
// sitemap.xml
// ─────────────────────────────────────────────
async function buildSitemap(origin) {
  let index = { products: [], categories: [] };
  try {
    const r = await fetch(`${CDN_BASE}/index.json`, {
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (r.ok) index = await r.json();
  } catch (e) {
    console.error("sitemap: index.json fetch failed:", e);
  }

  const products   = index.products || [];
  const categories = index.categories || [];

  const staticEntries = [
    { loc: "/",      priority: "1.0", changefreq: "daily"   },
    { loc: "/shop",  priority: "0.9", changefreq: "daily"   },
    { loc: "/track", priority: "0.3", changefreq: "monthly" }
  ];

  const categoryEntries = categories.map(cat => ({
    loc: `/category/${encodeURIComponent(cat)}`,
    priority: "0.7",
    changefreq: "weekly"
  }));

  const productEntries = products.map(p => ({
    loc: `/product/${encodeURIComponent(p.slug)}`,
    priority: "0.8",
    changefreq: "weekly",
    lastmod: p.updated_at || undefined,
    image: p.hero ? [p.hero] : undefined,
    imageTitle: p.title || undefined
  }));

  const all = [...staticEntries, ...categoryEntries, ...productEntries];

  const urls = all.map(e => {
    const parts = [`    <loc>${escapeXml(origin + e.loc)}</loc>`];
    if (e.lastmod)    parts.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
    if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority)   parts.push(`    <priority>${e.priority}</priority>`);
    if (e.image) {
      e.image.forEach(img => {
        parts.push(`    <image:image>`);
        parts.push(`      <image:loc>${escapeXml(img)}</image:loc>`);
        if (e.imageTitle) {
          parts.push(`      <image:title>${escapeXml(e.imageTitle)}</image:title>`);
        }
        parts.push(`    </image:image>`);
      });
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
function formatZar(cents) {
  if (cents == null) return "R0.00";
  return "R" + (cents / 100).toFixed(2);
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildProductHidden(product) {
  const lines = [];
  lines.push(product.title);
  lines.push(`Price: ${formatZar(product.price)}`);
  if (product.category) lines.push(`Category: ${product.category}`);
  if (product.summary)  lines.push(`\n${stripHtml(product.summary)}`);

  const colors = (product.colors || []).map(c => c.name).filter(Boolean);
  if (colors.length) lines.push(`Colours: ${colors.join(", ")}`);

  const sizes = Array.from(
    new Set((product.variants || []).map(v => v.size).filter(Boolean))
  );
  if (sizes.length) lines.push(`Sizes: ${sizes.join(", ")}`);

  return lines.join("\n");
}
