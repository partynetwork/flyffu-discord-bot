# MongoDB Authentication Fix for Docker Deployment

## Problem
When running `docker-compose --env-file .env.docker up -d`, the application shows "authorize fail" error when connecting to MongoDB.

## Root Causes
1. MongoDB container needs to be properly initialized with authentication credentials
2. The connection string in docker-compose.yml uses authentication that requires matching credentials
3. If MongoDB was previously started without proper credentials, the data volume may contain conflicting authentication data

## Solution Steps

### Step 1: Stop and Clean Existing Containers
```bash
# Stop all containers
docker-compose down

# Remove MongoDB volumes to ensure clean state (WARNING: This deletes all data)
docker-compose down -v
```

### Step 2: Verify Your .env.docker File
Ensure your `.env.docker` file has all required variables:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_actual_discord_bot_token
DISCORD_CLIENT_ID=your_actual_discord_client_id
GUILD_ID=

# MongoDB Configuration - THESE MUST MATCH!
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your_secure_password_here
MONGO_DATABASE=wazabz-discord-bot
MONGO_PORT=27017

# Application Configuration
PORT=3000
```

### Step 3: Start Services with Correct Environment File
```bash
# Use the --env-file flag to specify your environment file
docker-compose --env-file .env.docker up -d
```

### Step 4: Verify MongoDB Authentication
Wait for MongoDB to fully initialize (about 30-60 seconds), then test the connection:

```bash
# Check if MongoDB is healthy
docker-compose ps

# Test MongoDB connection with credentials
docker-compose exec mongodb mongosh -u admin -p your_secure_password_here --authenticationDatabase admin
docker-compose exec mongodb mongosh -u admin -p S1E2wc1wjOnQfLhS --authenticationDatabase admin
```

### Step 5: Check Application Logs
```bash
# View bot logs to see connection status
docker-compose logs -f bot
```

## Alternative Solutions

### Option 1: Use No Authentication (Development Only)
If you're in a development environment and don't need authentication:

1. Update docker-compose.yml to remove MongoDB authentication:
```yaml
mongodb:
  environment:
    # Comment out or remove these lines
    # MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME:-admin}
    # MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD:-password}
```

2. Update the bot's MONGODB_URI:
```yaml
bot:
  environment:
    # Simplified URI without authentication
    MONGODB_URI: mongodb://mongodb:27017/${MONGO_DATABASE:-wazabz-discord-bot}
```

### Option 2: Debug Connection String
Add debugging to see the actual connection string being used:

1. Temporarily add logging to check the connection string:
```bash
docker-compose exec bot printenv | grep MONGODB_URI
```

## Common Issues and Fixes

### Issue: "Authentication failed"
- **Cause**: Credentials in .env.docker don't match what MongoDB was initialized with
- **Fix**: Remove volumes and restart with correct credentials

### Issue: "Connection refused"
- **Cause**: MongoDB isn't ready yet or isn't running
- **Fix**: Wait for MongoDB health check to pass, check `docker-compose ps`

### Issue: Environment variables not loading
- **Cause**: Wrong path to .env.docker or syntax errors in the file
- **Fix**: Ensure file exists and has correct syntax (no spaces around =)

## Verification Commands

```bash
# 1. Check all services are running
docker-compose ps

# 2. Verify environment variables are loaded
docker-compose config

# 3. Test MongoDB connection manually
docker-compose exec mongodb mongosh "mongodb://admin:your_secure_password_here@localhost:27017/wazabz-discord-bot?authSource=admin"

# 4. Check bot logs for connection details
docker-compose logs bot | grep -i mongo
```

## Prevention
1. Always use `.env.docker` for Docker deployments, not `.env`
2. Keep MongoDB credentials consistent across deployments
3. Document your production credentials securely
4. Test locally with Docker before deploying to production