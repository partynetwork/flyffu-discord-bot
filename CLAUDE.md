# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS-based Discord bot designed for guild management and interactive events. The bot provides:
- Slash commands for creating events (particularly guild siege events)
- Thread-based event management with reaction tracking
- Role assignment via emoji reactions
- MongoDB integration for persistent data storage

## Architecture

### Core Components
- **DiscordService** (`src/discord.service.ts`): Main service handling Discord.js client, event listeners, slash commands, and all bot interactions
- **AppModule** (`src/app.module.ts`): NestJS root module with MongoDB configuration and service providers
- **Schemas**: Mongoose schemas for thread events and role reactions (`src/schemas/`)
- **Commands**: Slash command implementations in `src/discord-commands/`

### Key Features
- Thread event creation with timed expiration and reaction tracking
- Role reaction system for automatic role assignment/removal
- Guild siege event management with job class templates
- RESTful API endpoints for external integration
- Add preset emoji when bot was registered
- Add Emoji Job class icon to reaction message when post created
- Siege event close functionality with creator-only permissions
- Button-based interactions for siege events (attendance and job selection)

## Development Commands

### Installation
```bash
pnpm install
```

### Development
```bash
# Start in watch mode
pnpm run start:dev

# Start in debug mode
pnpm run start:debug

# Production build and start
pnpm run build
pnpm run start:prod
```

### Code Quality
```bash
# Lint and fix
pnpm run lint

# Format code
pnpm run format
```

### Testing
```bash
# Unit tests
pnpm run test

# Run a single test file
pnpm run test path/to/test.spec.ts

# E2E tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov

# Watch mode
pnpm run test:watch

# Debug tests
pnpm run test:debug
```

## Environment Configuration

Create `.env` file from `.env.example`:
- `DISCORD_BOT_TOKEN`: Discord bot token from Discord Developer Portal (required)
- `DISCORD_CLIENT_ID`: Discord application client ID (required for slash command registration)
- `GUILD_ID`: Optional guild ID for development (limits slash commands to specific guild)
- `MONGODB_URI`: MongoDB connection string (defaults to `mongodb://localhost:27017/wazabz-discord-bot`)
- `PORT`: HTTP server port (defaults to 3000)

## Database Models

### ThreadEvent Schema
- Tracks thread-based events with reactions, participants, and expiration
- Stores reaction breakdowns as Map<emoji, userIds[]>
- Automatically deactivates when event expires

### RoleReaction Schema
- Maps emoji reactions to Discord role IDs
- Enables automatic role assignment/removal on message reactions

### SiegeEvent Schema
- Tracks guild siege events with attendance and job assignments
- Stores creator ID for permission-based actions (close event)
- Maintains principal positions as Map<jobClass, userIds[]>
- Separate tracking for attendees and non-attendees

## Command Structure

Slash commands are located in `src/discord-commands/` and follow this pattern:
- Export default object with `data` (SlashCommandBuilder) and `execute` function
- Commands are auto-loaded by DiscordService during initialization
- Use Discord.js ChatInputCommandInteraction for handling

## Key Development Patterns

### Event Handling
- Discord events are handled in DiscordService setupEventHandlers()
- Reaction events automatically check for both thread events and role assignments
- Message reactions support both add/remove operations

### Database Operations
- Use injected Mongoose models via @InjectModel decorator
- Thread events support scheduled cleanup via setTimeout
- All database operations include proper error handling and logging

### API Integration
- DiscordService exposes public methods for HTTP controller integration
- Thread events can be created via both slash commands and HTTP API
- Results and participant data accessible via dedicated getter methods

## TypeScript Configuration

- Target: ES2023 with CommonJS modules
- Decorators enabled for NestJS
- Strict null checks enabled, but noImplicitAny disabled
- Source maps generated for debugging

## Testing Setup

- Jest with ts-jest transformer
- Unit tests: `*.spec.ts` files in src/
- E2E tests: `*.e2e-spec.ts` files in test/
- Test environment configured for Node.js

## Docker Deployment

### Production Setup
- Multi-stage Dockerfile with Node.js 20 Alpine
- Docker Compose configuration with MongoDB 7
- Non-root user execution for security
- Health checks for service reliability
- Persistent volumes for data and logs

### Docker Commands
```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

See `DOCKER_DEPLOYMENT.md` for detailed deployment instructions.

## Recent Updates

### Button Styling
- Siege event job class buttons changed from Primary to Secondary style (outline appearance)
- Attendance buttons maintain Success/Danger styles for visual distinction

### Close Event Feature
- Added close button to siege events (red button with lock emoji)
- Only event creator can close the event
- Closing removes all buttons and updates footer status
- Database tracks creator ID for permission verification
