export async function onRequestGet() {
  return new Response("htc2 route works", {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  });
}
