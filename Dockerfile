# Static site: trout water-temp dashboard, plus a page for every river and gage.
# nginx-unprivileged already runs as UID 101 and listens on 8080 — no root needed.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Custom config: gzip, cache headers, security headers, /healthz.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

# dist/ is the whole document root, written by `node build/generate.mjs`: the
# hand-written pages, the shared assets, vendored Leaflet, and the ~2,300
# generated river and gage pages with their sitemaps. It is not in git — build
# it before building the image, or this COPY fails and tells you so.
COPY dist/ /usr/share/nginx/html/

EXPOSE 8080
# Image's default CMD already starts nginx; no need to override.
