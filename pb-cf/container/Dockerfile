# PocketBase de Don Punto en Cloudflare Containers + Litestream (réplica continua a R2)
FROM alpine:3.20
RUN apk add --no-cache ca-certificates unzip wget sqlite tzdata
ARG PB_VERSION=0.39.11
ARG LS_VERSION=0.5.18
RUN wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip -O /tmp/pb.zip \
 && unzip -q /tmp/pb.zip pocketbase -d /usr/local/bin && rm /tmp/pb.zip \
 && wget -q https://github.com/benbjohnson/litestream/releases/download/v${LS_VERSION}/litestream-${LS_VERSION}-linux-x86_64.tar.gz -O /tmp/ls.tgz \
 && tar -xzf /tmp/ls.tgz -C /usr/local/bin litestream && rm /tmp/ls.tgz \
 && /usr/local/bin/pocketbase --version && /usr/local/bin/litestream version
COPY litestream.yml /etc/litestream.yml
COPY start.sh /start.sh
COPY pb_hooks /pb_hooks
RUN chmod +x /start.sh
EXPOSE 8090
CMD ["/start.sh"]
