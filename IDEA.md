---
status: done
progress: 100
---

# Trout Temps

<!--
IdeaBRD parses this file. It is the source of truth for this idea's tile:
the app re-reads it on every open and commits its own edits back here, so
the shape below matters more than it looks. Anything the parser
(backend/app/ideafile.py) can't read is dropped silently.

  frontmatter  status: one of idea, active, paused, done. progress: 0-100.
               Any other key is ignored.
  # heading    The idea title (first H1).
  prose        Everything outside the Todos section becomes the tile's
               notes, shown on the board — so keep it short. Documentation
               written here is published, not filed away.
  ## Todos     That heading exactly (or "## To-Dos"); "## ToDo", "## TODO"
               and "## Tasks" do not match and the whole list is lost.
               Inside it, only "- [ ] open" / "- [x] done" lines survive:
               sub-headings and blank-line grouping are discarded, and a
               wrapped item is cut at the line break, so keep each to-do on
               one line. The next "## " heading ends the list.
  (#12)        A to-do ending in an issue reference is backed by that issue
               in this repo. The issue wins: its title becomes the to-do's
               text and its open/closed state the checkbox, both here and on
               the board. Ticking the box in the app closes the issue.

Working in this repo? This file is the to-do list — use it rather than
starting a parallel one. Tick items off as you finish them, add new ones as
you find them, and keep status/progress honest: a TODO.md, a plan in a chat
window or a checklist in a commit message is invisible to everyone reading
the board. For work worth assigning, discussing, or writing up at length,
open a real issue and append its "(#12)" to the line — the item is then
tracked by number instead of text, and the issue holds the detail this file
has no room for (prose here is published to the board, not filed away).

To-dos without an issue are matched to the board by exact text, so rewording
one replaces it rather than editing it in place — expect a checked item to
come back unchecked if you reword it. Issue-backed to-dos are matched by
number instead, so keep the "(#12)" and reword freely; drop the reference and
the item becomes an ordinary to-do again (the issue itself is left alone).

HTML comments are stripped on read, so this block never reaches the board.
-->

Water-temperature dashboard for fly fishers: pulls live USGS gage readings (parameter 00010) and flags each river safe, caution or stop against the 65°F coldwater-trout recovery threshold, so you know whether to fish a stretch or leave it alone. Two static pages with no backend — a state-wide list/map view and a per-gage detail page with 7-day charts for temperature, discharge, gage height, turbidity and dissolved oxygen — served by nginx-unprivileged on K3s.

Live at https://trout-temps.nickknows.net. Everything talks to USGS directly from the browser, so there is no API key, no database and nothing to keep in sync; Leaflet is vendored into the image, and the CSP is pinned to the USGS, CARTO and Google Analytics origins the pages actually use. The deployment runs unprivileged and read-only on K3s with probes and resource limits, and the page logic — classification, USGS parsing, chart scaling, caching, clustering — is covered by a node --test suite that runs the shipped inline scripts.

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
- [x] Fix the detail page back link, which points at trout-temps.html and 404s — it should be /
- [x] Add liveness and readiness probes on /healthz, which the container serves but nothing checks
- [x] Add resource requests and limits and a securityContext to the deployment
- [x] Make the CI Helm bump tolerate an unchanged tag, since git commit -a fails the job on an empty diff
- [x] Add a favicon from idea_logo.png so every page load stops 404ing on /favicon.ico
- [x] Drop the unused CELSIUS_THRESHOLD constant, which holds a Fahrenheit value and is never read
- [x] Self-host Leaflet and the basemap CSS so the CSP can drop unpkg entirely
- [x] Remember the last selected state in localStorage instead of always opening on Colorado
- [x] Carry the selected state back from the detail page so "All gages" returns to where you were
- [x] Cluster or thin the map pins in states where gages sit on top of each other
- [x] Add real tests for classify, the USGS response parsing and the chart scaling, not just a syntax parse
- [x] Cache USGS responses briefly in the page so a filter or sort change stops refetching the state
- [x] Announce loading and error states to screen readers with aria-live
- [x] Bump the Helm chart version in CI alongside the image tag
- [x] Google Analytics (gtag.js) on both pages, with the CSP openings it needs
- [x] Site logo beside the dashboard headline, shared with the favicon and apple-touch icon
- [x] Re-apply the security headers inside every location block, since nginx drops inherited add_header
- [x] Re-fit the map when the map view is opened, so pins are not framed by a zero-size container
