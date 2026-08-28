#!/bin/bash
set -e
# Add 3GB swap to total 4GB
sudo dd if=/dev/zero of=/swapfile2 bs=1M count=3072
sudo chmod 600 /swapfile2
sudo mkswap /swapfile2
sudo swapon /swapfile2
echo '/swapfile2 none swap sw 0 0' | sudo tee -a /etc/fstab

# Install PostgreSQL 16
sudo dnf install -y postgresql-server
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create user and DB
sudo -u postgres psql -c "CREATE USER prospector_app WITH PASSWORD 'prospector_app_pass';"
sudo -u postgres psql -c "CREATE DATABASE prospectordb OWNER prospector_app;"

# Configure to listen on all interfaces
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" /var/lib/pgsql/data/postgresql.conf
echo "host all all 0.0.0.0/0 md5" | sudo tee -a /var/lib/pgsql/data/pg_hba.conf

# Restart Postgres
sudo systemctl restart postgresql
