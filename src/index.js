export default {
  async fetch(request) {

    const url = new URL(request.url)

    // Test route
    if (url.pathname.startsWith("/station/")) {

      const stationId = url.pathname.split("/")[2]

      return new Response(
        "Station page test for ID: " + stationId,
        { headers: { "content-type": "text/plain" } }
      )

    }

    // Default response
    return new Response("FuelPilot Worker is running")
  }
}