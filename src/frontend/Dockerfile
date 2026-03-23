FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# Source code mounted via docker-compose volume in development
EXPOSE 3000
CMD ["npm", "run", "dev"]
