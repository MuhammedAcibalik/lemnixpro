FROM node:24-alpine AS build

ARG SERVICE_PACKAGE

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY services ./services

RUN if [ -z "$SERVICE_PACKAGE" ]; then echo "SERVICE_PACKAGE build arg is required" >&2; exit 1; fi \
  && pnpm install --frozen-lockfile \
  && pnpm --filter "$SERVICE_PACKAGE" build

FROM node:24-alpine AS runner

ARG SERVICE_PACKAGE
ENV NODE_ENV=production
ENV SERVICE_PACKAGE=$SERVICE_PACKAGE

WORKDIR /app

RUN corepack enable

COPY --from=build /app ./

USER node

CMD ["sh", "-c", "pnpm --filter \"$SERVICE_PACKAGE\" start"]
