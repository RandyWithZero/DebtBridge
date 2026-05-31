FROM node:24.11.1-slim

ENV NODE_ENV=production
WORKDIR /app

RUN groupadd --system --gid 1001 debtbridge \
  && useradd --system --uid 1001 --gid debtbridge --home /app debtbridge

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=debtbridge:debtbridge apps ./apps
COPY --chown=debtbridge:debtbridge db ./db

USER debtbridge

EXPOSE 3000
EXPOSE 3001
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
