FROM node:22.16.0-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@9.15.9
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
RUN mkdir -p /data/evidence && chown -R node:node /data
USER node
ENV NODE_ENV=production
ENV EVIDENCE_DIRECTORY=/data/evidence
CMD ["pnpm", "--filter", "@moneyback/api", "start"]
