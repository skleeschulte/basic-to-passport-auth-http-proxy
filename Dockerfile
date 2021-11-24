FROM node:12
LABEL org.opencontainers.image.authors="Stefan Kleeschulte"
WORKDIR /usr/src/app
RUN npm install forever -g
COPY package*.json ./
RUN npm ci --production
COPY ["LICENSE", "README.md", "./"]
COPY lib lib
ENV  NODE_ENV production
EXPOSE 3000
CMD [ "forever", "--minUptime", "1000", "--spinSleepTime", "1000", "lib/server.js" ]