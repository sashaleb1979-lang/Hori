FROM node:24-alpine

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN PRISMA_GENERATE_SKIP_AUTOINSTALL=1 pnpm exec prisma generate
RUN pnpm build

ENV NODE_ENV=production
ENV APP_ROLE=bot

CMD ["node", "scripts/start.mjs"]
