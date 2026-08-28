#!/bin/bash
set -e
# Install Docker on Oracle Linux 9
sudo dnf install -y dnf-utils zip unzip
sudo dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker opc

# Stop the postgres we just installed (if any)
sudo systemctl stop postgresql || true
sudo systemctl disable postgresql || true

# Run PostGIS in Docker
sudo docker run -d --name atlas_postgres --restart always \
  -e POSTGRES_USER=prospector_app \
  -e POSTGRES_PASSWORD=prospector_app_pass \
  -e POSTGRES_DB=prospectordb \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgis/postgis:16-3.4

# Open firewall port 5432 on OS level
sudo firewall-cmd --zone=public --add-port=5432/tcp --permanent || true
sudo firewall-cmd --reload || true
