# Builds this repository's Vite/React SPA and serves the static dist/ output from a minimal nginx
# image. Built directly on the VPS and imported into k3s's own containerd (adr/0026's "no registry"
# image-delivery decision, the same one ago-chat's own Dockerfile follows) - not pushed anywhere,
# no CI wiring here.
#
# .env.production (committed - see .gitignore's own exception, none of its values are secrets) is
# picked up automatically by `vite build`'s own default production mode, no extra --mode flag or
# build ARG needed here. That is also how `8-06`'s VITE_PUBLIC_DEMO reaches the image, so no change
# was needed here or in ago-deploy for it.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx's own "-alpine-slim" variant - the closest analogue to 8-00's Chiseled-image preference
# that actually exists for nginx (Chiseled itself is a .NET/Microsoft base-image family with no
# nginx equivalent): official image, not a bespoke build, with the dynamic modules this
# static-file-only container never uses (image filter, mail proxy, stream) stripped out.
FROM nginx:1.27-alpine-slim
COPY --from=build /app/dist /usr/share/nginx/html
# react-router (adr/0023) does real client-side routing (/callback at minimum) - the default nginx
# config 404s on a direct load of anything but /, so every path needs to fall back to index.html
# and let the SPA's own router take over from there.
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
