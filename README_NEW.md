# Garmin AI Coach

An LLM-driven AI coaching system that learns from your Garmin data and provides personalized, adaptive training plans.

## 🎯 Overview

Garmin AI Coach combines your Garmin health/training data with a local LLM (via LM Studio) to deliver:
- **Daily workout recommendations** (4 options: indoor/outdoor × primary/backup)
- **Weekly training plans** with intelligent periodization
- **Recovery-based guardrails** protecting against overtraining
- **Conversational AI coach** you can chat with about your training

**Key Principles:**
- 🧠 **LLM as the coaching brain** - All training decisions made by AI with rich context
- 🔒 **Privacy-first** - Your data stays local, uses LM Studio (no cloud AI)
- 🛡️ **Safety validation** - Backstop logic ensures AI doesn't prescribe unsafe workouts
- 📊 **Data-driven** - Decisions based on HRV, RHR, sleep, training load, subjective feedback
- 🎯 **Flexible periodization** - Adaptive, event-driven, or block periodization

## 🏗️ Architecture

- **Backend**: Node.js + Express + SQLite
- **Frontend**: React + Vite + Tailwind CSS
- **Garmin Sync**: Python `garth` library wrapped for Node.js
- **LLM**: Local LM Studio via OpenAI-compatible API
- **Deployment**: Docker + Docker Compose

## 📋 Prerequisites

1. **Docker & Docker Compose** installed
2. **LM Studio** running locally with a model loaded
   - Download from: https://lmstudio.ai/
   - Load a good instruct model (e.g., Mistral, Llama 3, etc.)
   - Start server on default port 1234
3. **Garmin Connect account**
4. **OpenWeatherMap API key** (free tier: https://openweathermap.org/api)

## 🚀 Quick Start

### 1. Clone and Configure

```bash
cd /path/to/coach
cp .env.example .env
```

Edit `.env` with your settings:
```bash
OPENWEATHER_API_KEY=your_key_here
LM_STUDIO_URL=http://host.docker.internal:1234/v1
TZ=America/New_York  # Your timezone
```

### 2. Build and Run

```bash
# Build Docker image
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f coach
```

### 3. Access the App

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8080
- **Health check**: http://localhost:8080/api/health

### 4. Development Mode

For frontend development with hot reload:

```bash
docker-compose --profile dev up
```

This runs the backend in production mode but mounts the frontend with Vite dev server.

## 📁 Project Structure

```
coach/
├── backend/
│   ├── src/
│   │   ├── server.js           # Express app entry point
│   │   ├── db/
│   │   │   ├── index.js        # Database connection
│   │   │   └── migrations/     # SQLite migrations
│   │   ├── routes/             # API endpoints
│   │   ├── services/
│   │   │   ├── garth-wrapper.py        # Python Garmin sync
│   │   │   ├── garmin-sync.js          # Node.js Garmin wrapper
│   │   │   ├── context-builder.js      # LLM context assembly
│   │   │   ├── llm-coach.js            # LM Studio integration
│   │   │   └── validator.js            # Safety validation
│   │   ├── prompts/            # LLM prompt templates
│   │   └── utils/
│   └── package.json
├── frontend/
│   └── (React + Vite setup)
├── data/                       # SQLite database + local storage
├── logs/                       # Application logs
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## 🔧 API Endpoints

### Health
- `GET /api/health` - System health check

### Garmin Integration
- `POST /api/garmin/login` - Authenticate with Garmin
- `POST /api/garmin/sync` - Sync data for date range
- `GET /api/garmin/status` - Check session validity

### Coaching
- `POST /api/recommend` - Generate today's workout options
- `GET /api/recommend/week` - Generate weekly training plan
- `POST /api/chat` - Chat with AI coach

### Data
- `POST /api/profile` - Create/update athlete profile
- `POST /api/daily` - Log daily metrics
- `GET /api/stats/summary` - Get training stats

### Weather
- `GET /api/weather/forecast` - Get weather forecast (proxied)

## 🧪 Testing

```bash
# Run backend tests
cd backend
npm test

# Run with coverage
npm run test:coverage
```

## 📊 Database Schema

- **users** - Garmin authentication
- **athlete_profiles** - Training preferences, baselines,injuries
- **daily_metrics** - Garmin sync data + manual entries
- **llm_decisions** - Audit trail of all AI decisions
- **workout_history** - Completed workouts + feedback
- **weekly_summaries** - Weekly training plans
- **training_modes** - Periodization preferences

## 🔐 Security Notes

⚠️ **This is a local-only development tool. Do NOT expose to the internet without:**
- Adding authentication
- Implementing rate limiting
- Encrypting sensitive data
- Using HTTPS
- Securing environment variables

## 🤝 Contributing

This is a personal coaching tool, but contributions welcome:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

GPL-3.0 - See LICENSE file

## 🙏 Credits

- **GarminDB** - Original inspiration for Garmin data sync
- **garth** - Python library for Garmin Connect API
- **LM Studio** - Local LLM runtime

## 📚 Further Reading

- [LM Studio Documentation](https://lmstudio.ai/docs)
- [Garth Library](https://github.com/matin/garth)
- [Training Load Concepts](https://www.trainingpeaks.com/blog/what-is-tss/)
- [80/20 Running](https://www.8020endurance.com/)

## 🐛 Troubleshooting

### LM Studio not connecting
- Verify LM Studio is running: http://localhost:1234/v1/models
- Check `LM_STUDIO_URL` in `.env`
- Ensure model is loaded in LM Studio

### Garmin sync fails
- Check credentials in app settings
- Verify internet connection
- Look for Python errors in `docker-compose logs coach`

### Database errors
- Stop containers: `docker-compose down`
- Remove old database: `rm data/coach.db`
- Restart: `docker-compose up -d`

### LLM gives unsafe recommendations
- Check `logs/combined.log` for validation errors
- LLM decisions logged to `llm_decisions` table
- Fallback safety mode activates automatically

---

**Built with ❤️ for athletes who want smarter, data-driven training**
