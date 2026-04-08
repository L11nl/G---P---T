FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

RUN npx playwright install firefox

COPY . .

CMD ["npm", "start"]
