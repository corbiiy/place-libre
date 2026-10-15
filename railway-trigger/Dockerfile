# Railway cron service that starts the Place Libre refresh (see trigger.sh).
FROM alpine:3.20
RUN apk add --no-cache curl tzdata
COPY trigger.sh /trigger.sh
CMD ["sh", "/trigger.sh"]
