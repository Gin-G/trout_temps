# trout_temps
A site to look at the water temperature reported at different rivers to figure out if it's safe to fish or not

## Layout

- `trout_temps.html` — the dashboard (list + map), served as `/`
- `detail.html` — per-gage 7-day charts
- `vendor/leaflet/` — Leaflet 1.9.4, vendored so the CSP needs no third-party script origin
- `nginx.conf` / `security-headers.conf` — the server config baked into the image
- `helm_trout/` — the chart deployed to K3s
- `tests/` — node:test suite covering the page logic

## Development

The pages are static: open `trout_temps.html` in a browser and it works.

Run the tests with a plain Node 22+ install, no dependencies:

```
node --test tests/*.test.mjs
```

The suite pulls the inline `<script>` out of each page and runs it against a stub
DOM, so the tested code is exactly the code that ships.
