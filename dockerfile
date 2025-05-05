FROM node:18-alpine
WORKDIR /app

# install all dependencies (incl. dev for ts-node & nodemon)
COPY package.json yarn.lock ./
RUN yarn install

# copy source for dev
COPY . .

# allow more heap for ts-node
ENV NODE_OPTIONS=--max_old_space_size=4096

EXPOSE 8080

# launch your dev server
CMD ["yarn", "run", "dev:server"]
