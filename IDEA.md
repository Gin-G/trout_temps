---
status: active
progress: 80
---

# Trout Temps

Water-temperature dashboard for fly fishers: pulls live USGS gage readings (parameter 00010) and flags each river safe, caution or stop against the 65°F coldwater-trout recovery threshold, so you know whether to fish a stretch or leave it alone. Two static pages with no backend — a state-wide list/map view and a per-gage detail page with 7-day charts for temperature, discharge, gage height, turbidity and dissolved oxygen — served by nginx-unprivileged on K3s.

Live at https://trout-temps.nickknows.net. Everything talks to USGS directly from the browser, so there is no API key, no database and nothing to keep in sync; the CSP is pinned to the USGS, unpkg and CARTO origins the pages actually use. The remaining work is hardening and polish rather than new capability — the back link on the detail page is broken, the deployment has no probes or resource limits, and Leaflet still comes from a CDN.

## Todos

- [x] Single-page dashboard reading the USGS Instantaneous Values service for parameter 00010
- [x] Safe / caution / stop classification with the 60°F and 65°F cutoffs, in both °F and °C
- [x] State selector across the 15 main trout states, name filter, and coldest/warmest/A–Z sort
- [x] Summary strip counting reporting gages in each band for the whole state
- [x] De-duplicate gages that report multiple sub-series for the same site
- [x] List/map toggle with a Leaflet map, temperature-labelled pins colour-coded by band, and popups
- [x] Light CARTO basemap and auto-fit bounds to the gages in view
- [x] Per-gage detail page with a current-reading hero card and verdict badge
- [x] Hand-rolled SVG line/area charts for temp, discharge, gage height, turbidity and dissolved oxygen
- [x] 65°F threshold line drawn into the temperature chart and forced into its y-range
- [x] Graceful empty and error states for gages that report nothing in the last 7 days
- [x] nginx-unprivileged container on 8080 with CSP, security headers, gzip, /healthz and server_tokens off
- [x] Dockerfile serving trout_temps.html as index.html so the dashboard is the site root
- [x] GitHub Actions: parse the inline page scripts, lint nginx.conf in the shipping base image
- [x] GitHub Actions: build and push ncging/trout-temps on a dated tag plus latest, bump values.yaml, push back
- [x] Helm chart with deployment, ClusterIP service, Traefik ingress, cert-manager TLS and an HTTPS-redirect middleware
- [x] Fix the 502 by matching the service port to nginx-unprivileged's 8080
- [x] Move the ingress from the nginx class to traefik to match the cluster
- [ ] Fix the detail page back link, which points at trout-temps.html and 404s — it should be /
- [ ] Add liveness and readiness probes on /healthz, which the container serves but nothing checks
- [ ] Add resource requests and limits and a securityContext to the deployment
- [ ] Make the CI Helm bump tolerate an unchanged tag, since git commit -a fails the job on an empty diff
- [ ] Add a favicon from idea_logo.png so every page load stops 404ing on /favicon.ico
- [ ] Drop the unused CELSIUS_THRESHOLD constant, which holds a Fahrenheit value and is never read
- [ ] Self-host Leaflet and the basemap CSS so the CSP can drop unpkg entirely
- [ ] Remember the last selected state in localStorage instead of always opening on Colorado
- [ ] Carry the selected state back from the detail page so "All gages" returns to where you were
- [ ] Cluster or thin the map pins in states where gages sit on top of each other
- [ ] Add real tests for classify, the USGS response parsing and the chart scaling, not just a syntax parse
- [ ] Cache USGS responses briefly in the page so a filter or sort change stops refetching the state
- [ ] Announce loading and error states to screen readers with aria-live
- [ ] Bump the Helm chart version in CI alongside the image tag
