export async function onRequestGet(context) {
  return renderAlbumPage(context, "htc4");
}

async function renderAlbumPage(context, albumId) {
  const { request, env } = context;
  const url = new URL(request.url);

  const shell = await env.ASSETS.fetch(new URL("/", url.origin));
  const html = await shell.text();

  const dataRes = await env.ASSETS.fetch(new URL("/data.json", url.origin));
  const data = await dataRes.json();

  const allAlbums = [...(data.albums || []), data.comingSoonAlbum].filter(Boolean);
  const album = allAlbums.find(a => a.id === albumId);

  if (!album) return new Response("Album not found", { status: 404 });

  const cover = `${data.baseUrl}/images/${album.cover}`;
  const pageUrl = `https://htcoll.shop/${albumId}`;
  const pageTitle = `${album.title} — ${album.artist} | HTs Collections`;
  const dateLine = album.releaseDate ? `Released ${album.releaseDate}.` : `Released ${album.year}.`;
  const description = `${album.title} by ${album.artist}. ${album.tracks.length} tracks. ${dateLine} Stream on HTs Collections.`;

  const tracklistText = (album.tracks || []).map((t, i) => {
    const mix = t.mix ? ` (${t.mix})` : '';
    return `${i + 1}. ${t.artist} - ${t.title}${mix}`;
  }).join('\n');

  const hiddenBlock = `
<div style="display:none" aria-hidden="true">
${album.title} — ${album.artist} (${album.year})
${album.tracks.length} tracks. ${dateLine}
Tracklist:
${tracklistText}
</div>`;

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(pageTitle); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute("href", pageUrl); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute("content", pageTitle); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute("content", description); } })
    .on('meta[property="og:image"]', { element(el) { el.setAttribute("content", cover); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute("content", pageUrl); } })
    .on('meta[name="twitter:title"]', { element(el) { el.setAttribute("content", pageTitle); } })
    .on('meta[name="twitter:description"]', { element(el) { el.setAttribute("content", description); } })
    .on('meta[name="twitter:image"]', { element(el) { el.setAttribute("content", cover); } })
    .on("body", { element(el) { el.append(hiddenBlock, { html: true }); } })
    .transform(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
}
