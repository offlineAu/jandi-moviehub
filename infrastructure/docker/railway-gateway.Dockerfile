FROM nginx:1.28-alpine
ENV PORT=8080 NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM|WEB_UPSTREAM)$"
COPY infrastructure/railway/gateway.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
