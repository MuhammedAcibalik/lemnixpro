FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY services ./services

RUN corepack enable \
  && pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@lemnixpro/api-gateway-service", "start"]
