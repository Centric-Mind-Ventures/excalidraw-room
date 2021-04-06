FROM node:12-alpine

WORKDIR /excalidraw-room

COPY package.json yarn.lock ./
RUN yarn

COPY tsconfig.json ./
COPY src ./src
RUN yarn build

EXPOSE 8080
ENV PORT=8008
ENV DEBUG=*,-socket.io:*,-engine:*,-socket.io-parser
CMD ["yarn", "start"]
