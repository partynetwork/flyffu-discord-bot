# Docker Deployment Guide

This guide explains how to deploy the Wazabz Discord Bot using Docker and Docker Compose.

## Prerequisites

- Docker Engine installed (version 20.10 or higher)
- Docker Compose installed (version 2.0 or higher)
- Discord Bot Token and Client ID from Discord Developer Portal

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wazabz-discord-bot
   ```

2. **Create environment file**
   ```bash
   cp .env.docker.example .env
   ```

3. **Configure environment variables**
   Edit `.env` file and add your Discord credentials:
   - `DISCORD_BOT_TOKEN`: Your Discord bot token
   - `DISCORD_CLIENT_ID`: Your Discord application client ID
   - `MONGO_ROOT_PASSWORD`: Set a secure password for MongoDB

4. **Start the services**
   ```bash
   docker-compose up -d
   ```

## Docker Compose Services

### MongoDB Service
- **Image**: mongo:7-jammy
- **Port**: 27017 (configurable via MONGO_PORT)
- **Volumes**: 
  - `mongodb_data`: Persistent data storage
  - `mongodb_config`: Configuration storage
- **Health Check**: Automatic health monitoring

### Bot Application
- **Build**: Multi-stage Dockerfile for optimized production image
- **Port**: 3000 (configurable via PORT)
- **Dependencies**: Waits for MongoDB to be healthy before starting
- **Volumes**: 
  - `./logs`: Persistent logging directory

## Common Commands

### Start services
```bash
docker-compose up -d
```

### Stop services
```bash
docker-compose down
```

### Stop and remove volumes (WARNING: This will delete all data)
```bash
docker-compose down -v
```

### View logs
```bash
# All services
docker-compose logs -f

# Bot only
docker-compose logs -f bot

# MongoDB only
docker-compose logs -f mongodb
```

### Rebuild bot image
```bash
docker-compose build bot
docker-compose up -d bot
```

### Access MongoDB shell
```bash
docker-compose exec mongodb mongosh -u admin -p
```

## Environment Variables

### Required
- `DISCORD_BOT_TOKEN`: Discord bot token
- `DISCORD_CLIENT_ID`: Discord application client ID

### Optional
- `GUILD_ID`: Limit slash commands to specific guild (development)
- `MONGO_ROOT_USERNAME`: MongoDB root username (default: admin)
- `MONGO_ROOT_PASSWORD`: MongoDB root password (default: password)
- `MONGO_DATABASE`: Database name (default: wazabz-discord-bot)
- `MONGO_PORT`: MongoDB port (default: 27017)
- `PORT`: Application HTTP port (default: 3000)

## Production Considerations

1. **Security**
   - Always use strong passwords for MongoDB
   - Keep your Discord bot token secure
   - Consider using Docker secrets for sensitive data

2. **Backup**
   - Regularly backup MongoDB data volume
   - Example backup command:
     ```bash
     docker-compose exec mongodb mongodump -u admin -p --out /backup
     ```

3. **Monitoring**
   - Monitor container logs for errors
   - Set up health check alerts
   - Consider using monitoring tools like Prometheus

4. **Updates**
   - Pull latest changes from repository
   - Rebuild Docker image
   - Restart services with minimal downtime:
     ```bash
     docker-compose build bot
     docker-compose up -d bot
     ```

## Troubleshooting

### Bot not connecting to MongoDB
- Check if MongoDB is healthy: `docker-compose ps`
- Verify MONGODB_URI in bot logs: `docker-compose logs bot`
- Ensure MongoDB credentials match in .env file

### Slash commands not working
- Verify DISCORD_CLIENT_ID is correct
- Check bot permissions in Discord server
- Look for registration errors in logs

### Container keeps restarting
- Check logs: `docker-compose logs -f bot`
- Verify all required environment variables are set
- Ensure Discord token is valid

## Network Architecture

The services communicate through a Docker bridge network (`wazabz_network`), providing:
- Service isolation from host network
- Internal DNS resolution (services can reach each other by name)
- Automatic service discovery