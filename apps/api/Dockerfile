FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm ci --workspace @erp/api --workspace @erp/shared --include-workspace-root \
  && npm run build --workspace @erp/shared \
  && npm run build --workspace @erp/api

EXPOSE 4000

CMD ["node", "apps/api/dist/src/main.js"]
