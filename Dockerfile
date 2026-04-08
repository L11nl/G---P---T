hereFROM mcr.microsoft.com/playwright:v1.42.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

RUN npx playwright install firefox

COPY . .

CMD ["npm", "start"]
