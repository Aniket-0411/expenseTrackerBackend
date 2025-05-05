FROM node:18-alpine

WORKDIR /app

# copy package manifests and install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# copy source
COPY . .

# adjust the port if needed
EXPOSE 3000

# start in dev mode
CMD ["yarn", "run", "dev:server"]
