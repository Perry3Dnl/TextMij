FROM node:24-alpine
ARG APP_REVISION=development
ENV NODE_ENV=production PORT=3000 APP_REVISION=${APP_REVISION}
WORKDIR /app
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{const b=await r.json();process.exit(r.ok&&b.status==='ok'&&b.revision===process.env.APP_REVISION?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
