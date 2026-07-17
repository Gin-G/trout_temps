# Static site: trout water-temp dashboard.
# nginx-unprivileged already runs as UID 101 and listens on 8080 — no root needed.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Custom config: gzip, cache headers, security headers, /healthz.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# The three app files. They contain no secrets — safe to bake in.
COPY trout_temps.html detail.html /usr/share/nginx/html/
# Serve the main page at /, replacing the base image's stock index.html
COPY trout_temps.html /usr/share/nginx/html/index.html

EXPOSE 8080
# Image's default CMD already starts nginx; no need to override.
