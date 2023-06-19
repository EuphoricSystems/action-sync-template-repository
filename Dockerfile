FROM node:20-alpine3.16

RUN mkdir /action
WORKDIR /action

COPY action ./

RUN yarn install --production

ENTRYPOINT ["node", "/action/index.js"]
