FROM nginx:1.13.8

RUN apt update
RUN apt install -y curl xz-utils less

COPY dist /usr/share/nginx/html
