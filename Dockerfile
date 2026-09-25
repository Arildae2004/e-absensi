FROM php:8.2-apache
RUN docker-php-ext-install mysqli pdo pdo_mysql
COPY . /var/www/html/
RUN chown -R www-data:www-data /var/www/html
EXPOSE 80
# Railway memberi PORT dinamis: arahkan Apache + siapkan DB lalu jalan
CMD sh -c "php /var/www/html/setup_db.php; sed -i \"s/Listen 80/Listen ${PORT:-80}/\" /etc/apache2/ports.conf; sed -i \"s/*:80>/*:${PORT:-80}>/\" /etc/apache2/sites-enabled/000-default.conf; apache2-foreground"
