# NEXO · Backend PHP para Render (Apache + PHP 8.2, curl ya incluido)
FROM php:8.2-apache

# mod_rewrite para el .htaccess y raíz pública en /public
RUN a2enmod rewrite headers \
 && sed -i 's#/var/www/html#/var/www/html/public#g' /etc/apache2/sites-available/000-default.conf \
 && sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

WORKDIR /var/www/html
COPY . /var/www/html
RUN chown -R www-data:www-data /var/www/html

# Render indica el puerto en $PORT (por defecto 10000)
CMD ["sh", "-c", "sed -i \"s/80/${PORT:-10000}/g\" /etc/apache2/ports.conf /etc/apache2/sites-available/000-default.conf && apache2-foreground"]
