export async function onRequestGet(context) {
  return renderAlbum(context, "htc1");
}

async function renderAlbum(context, albumId) {
  const { request, env } = context;
  const url = new URL(request.url);

  const shell = await env.ASSETS.fetch(new URL("/", url.origin));
  const html = await shell.text();

  const data = await (await env.ASSETS.fetch(new URL("/data.json", url.origin))).json();
  const album = [...(data.albums || []), data.comingSoonAlbum].find(a => a.id === albumId);
  if (!album) return new Response("Not found", { status: 404 });

  const cover = `${data.baseUrl}/images/${album.cover}`;
  const tracklist = album.tracks.map((t, i) =>
    `${i + 1}. ${t.artist} - ${t.title}${t.mix ? ' (' + t.mix + ')' : ''}`
  ).join('\n');

  const seoBlock = `
<div style="display:none" aria-hidden="true">
${album.title} — ${album.artist} (${album.year})
Tracklist:
${tracklist}
</div>`;

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(`${album.title} — ${album.artist} | HTs Collections`); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", `${album.title} by ${album.artist} (${album.year}). ${album.tracks.length} tracks. Stream on HTs Collections.`); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute("content", `${album.title} — ${album.artist}`); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute("content", `${album.tracks.length} tracks by ${album.artist}. Released ${album.year}.`); } })
    .on('meta[property="og:image"]', { element(el) { el.setAttribute("content", cover); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute("content", `https://htcoll.shop/${albumId}`); } })
    .on("body", { element(el) { el.append(seoBlock, { html: true }); } })
    .transform(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
}
