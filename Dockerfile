FROM nginx:1.27.0

RUN apt update
RUN apt install -y curl xz-utils less

COPY dist /usr/share/nginx/html
