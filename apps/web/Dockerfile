FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN npm ci --workspace @erp/web --workspace @erp/shared --include-workspace-root \
  && npm run build --workspace @erp/shared

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace", "@erp/web", "--", "--host", "0.0.0.0"]
