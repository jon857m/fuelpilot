export default {
  async fetch(request) {
    return new Response("FuelPilot Worker is running", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-fp-worker": "seo-stations-test"
      }
    });
  }
};