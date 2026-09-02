FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm ci --workspace @erp/mock-partner --include-workspace-root \
  && npm run build --workspace @erp/mock-partner

EXPOSE 4010

CMD ["node", "apps/mock-partner/dist/server.js"]
