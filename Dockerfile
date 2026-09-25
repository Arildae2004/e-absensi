FROM php:8.2-cli
RUN docker-php-ext-install mysqli pdo pdo_mysql
COPY . /var/www/html/
EXPOSE 80
# Siapkan DB (buat tabel + seed bila kosong) lalu jalankan server di PORT Railway
CMD sh -c "php /var/www/html/setup_db.php; php -S 0.0.0.0:${PORT:-80} -t /var/www/html"
