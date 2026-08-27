# Builds this repository's Vite/React SPA and serves the static dist/ output from a minimal nginx
# image.
#
# `15-07`/`adr/0051`: CI publishes this to GHCR as ghcr.io/golyakoff/ago-console, tagged with the
# full 40-character commit SHA - the same shape adr/0047 gave the three Ago.Chat.* hosts. It
# supersedes adr/0026's "build it on the VPS and import it into containerd", which is now the
# fallback rather than the mechanism. This repository is the one the 2026-08-25 stale-bundle
# incident actually happened to.
#
# .env.production (committed - see .gitignore's own exception, none of its values are secrets) is
# picked up automatically by `vite build`'s own default production mode, no extra --mode flag or
# build ARG needed here. That is also how `8-06`'s VITE_PUBLIC_DEMO reaches the image, so no change
# was needed here or in ago-deploy for it. **That committed file is also what makes adr/0051 work
# for this repository**: the deployment's API origin and Keycloak issuer are properties of the
# commit, not of whoever ran `docker build`, so ago-console:<sha> is a function of the commit alone.
# Nothing here may be turned into a build ARG without re-opening that decision - a VITE_* ARG would
# let two different bundles claim one SHA tag.
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx's own "-alpine-slim" variant - the closest analogue to 8-00's Chiseled-image preference
# that actually exists for nginx (Chiseled itself is a .NET/Microsoft base-image family with no
# nginx equivalent): official image, not a bespoke build, with the dynamic modules this
# static-file-only container never uses (image filter, mail proxy, stream) stripped out.
FROM nginx:1.31-alpine-slim
# `17-04`: the base tag names the image nginx's own maintainers published, not the Alpine packages
# inside it *today* - Alpine ships security fixes into its package repositories continuously,
# independent of when a base image was last rebuilt from them. `ci.yml`'s own Trivy scan caught
# exactly this drift the first time it ran: CVE-2026-14456 (openssl, already `fixed` upstream per
# Trivy's own report) present in this tag's frozen `libssl3`/`libcrypto3` layer. `apk upgrade`
# reaches into the live package repository at build time and pulls whatever is patched *now*, so
# this image stays current between nginx's own rebuilds instead of only at the moment this Dockerfile
# happens to be edited. `--no-cache` skips the local index (so nothing here goes stale the way the
# base layer just did) without leaving `/var/cache/apk` behind to bloat the image.
RUN apk update && apk upgrade --no-cache
# The commit this image is built from (`15-07`). Defaults to "unknown" rather than failing the
# build: a local `docker build` for a quick check is a legitimate thing to do, and it should say
# "unknown" out loud rather than lie or refuse.
ARG GIT_COMMIT=unknown
# The OCI annotations a registry and `docker inspect`/`crane config` read. `.source` is not only
# documentation - GHCR uses it to link the published package back to this repository, which is what
# makes the package inherit the repository's own visibility instead of arriving orphaned.
LABEL org.opencontainers.image.source="https://github.com/golyakoff/ago-console" \
      org.opencontainers.image.description="AGO Chat operator console" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.revision="${GIT_COMMIT}"
COPY --from=build /app/dist /usr/share/nginx/html
# react-router (adr/0023) does real client-side routing (/callback at minimum) - the default nginx
# config 404s on a direct load of anything but /, so every path needs to fall back to index.html
# and let the SPA's own router take over from there.
COPY nginx.conf /etc/nginx/conf.d/default.conf
# `15-07`: the commit as a file the running container serves. A label is invisible from outside the
# cluster and an image tag is a name somebody chose; this is the copy a `curl
# https://console.reserve-me.ru/version.json` can read, which is precisely what nobody could do on
# 2026-08-25 when this bundle was a week stale. Written after the COPY above, so it cannot be
# shadowed by anything in dist/. Deliberately no build timestamp: two builds of one commit should be
# the same artifact, and a clock is the easiest way to make them differ for no reason.
#
# A file rather than a Vite `define` in the JS: the console is always loaded from an origin that
# serves this file next to it, so there is nothing a `define` would reach that this does not - and a
# plain file is readable by curl, by smoke.sh and by the API server's pod proxy without parsing a
# minified bundle. (The widget's answer is the other way round, and for the opposite reason: its
# bundle is loaded from *someone else's* page.)
RUN printf '{"app":"ago-console","commit":"%s"}\n' "${GIT_COMMIT}" \
      > /usr/share/nginx/html/version.json
EXPOSE 80
