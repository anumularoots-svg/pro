# ------- Stage 1: Build -------
FROM node:18 as build
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . 

# Build the react app
RUN npm run build

# ------- Stage 2: NGINX Serve -------
FROM nginx:alpine

# Copy build output to nginx static folder
COPY --from=build /app/dist /usr/share/nginx/html

# Remove default nginx config and add our own
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
