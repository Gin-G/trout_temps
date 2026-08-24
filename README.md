# trout_temps
A site to look at the water temperature reported at different rivers to figure out if it's safe to fish or not

## Layout

- `trout_temps.html` — the dashboard (list + map), served as `/`
- `detail.html` — the old query-string gage view, kept for existing links
- `assets/` — the CSS and JS shared by the dashboard, `detail.html` and every generated page
- `build/` — the page generator (see below)
- `vendor/leaflet/` — Leaflet 1.9.4, vendored so the CSP needs no third-party script origin
- `nginx.conf` / `security-headers.conf` — the server config baked into the image
- `helm_trout/` — the chart deployed to K3s
- `tests/` — node:test suite covering the page logic and the generator

## The generated pages

The dashboard is one URL whose river names arrive over `fetch`, so there is
nothing in it for a search for "Big Thompson temperature" to match. `build/`
fixes that: it reads USGS at build time and writes a page per river and a page
per gage, each with the name in its URL, title and heading, and a month of real
readings in the markup rather than behind a script.

```
node build/generate.mjs            # writes dist/, about 2,350 pages, ~25s
node build/generate.mjs --states co,mt   # a couple of states, for a quick loop
```

`dist/` is the whole document root — the hand-written pages, the assets, vendored
Leaflet, the generated pages and the sitemaps — and it is what the Dockerfile
copies. It is not in git: CI regenerates it on every build, and on a weekly cron
so the baked readings do not go stale.

| URL | What it is |
| --- | --- |
| `/` | the dashboard |
| `/rivers/` | every state |
| `/rivers/colorado/` | every river in one state |
| `/river/colorado/big-thompson-river/` | one river, all its gages |
| `/gage/402114105350101/` | one gage, with the 7-day charts |
| `/near/` and `/near/estes-park-co/` | one page per fishing town |

The pages read USGS live on top of the baked numbers, so a visitor gets the
current temperature and a crawler gets a page that says something without
running any JavaScript.

## Towns

`/near/<town>-<state>/` is the crawlable half of "Near me": every gage within 40
miles of a town, nearest first. The town names come out of the station names
themselves — USGS calls a gage "BIG THOMPSON BL MORAINE PARK NR ESTES PARK, CO",
so the tail after the last NR/NEAR/AT is the settlement and no gazetteer is
needed. Tails naming water or hardware ("below Hwy 85", "abv Strontia Spgs
Reservoir") are rejected, abbreviations are expanded so "COLO. SPRINGS" and
"COLORADO SPRINGS" share one page, and a town needs at least three gages in
reach to get a page at all — a thin page is worse than no page.

The list is anchored on the gages that name the town but is not limited to them:
somebody staying in Estes Park wants the Colorado and the Fraser too.

## The social card

`social-card.png` is 1200x630, drawn by `build/social-card.py` with Pillow from
the site's own palette and logo, which is what earns the full-width
`summary_large_image` treatment instead of a small square thumbnail. It holds no
live data, so it is committed rather than rebuilt per deploy — re-run the script
if the palette or the headline changes.

## Near me

The dashboard reads a state by default, but a state line is not a fishing
constraint: from Fort Collins the closest cold water is over the Wyoming border,
and picking "Colorado" hides it. "Near me" asks the browser for a position and
queries a 100-mile box around it instead (widening once to 150 if that box is
nearly empty), sorted by distance.

USGS rejects a bounding box over 25 square degrees measured at the equator, so
`boundingBox()` clamps to that. The corners go out rounded to one decimal —
about seven miles — which is all USGS needs and keeps the visitor's actual
position out of a URL. Nothing prompts for location until the button is pressed;
a refusal falls back to the state picker and says why.

## Development

The dashboard alone still works by opening `trout_temps.html` in a browser, but
its gage links point at `/gage/<id>/`, so the whole site needs a document root:

```
node build/generate.mjs
python3 -m http.server -d dist 8000
```

Run the tests with a plain Node 22+ install, no dependencies:

```
node --test tests/*.test.mjs
```

The suite pulls the dashboard's inline `<script>` out of the HTML and runs the
shared `assets/gage.js` directly, so the tested code is exactly the code that
ships. The generator is tested through its own modules — river-name parsing and
the page templates — with no network involved.
