# Railway Deployment Instructions

## Critical Issues Fixed:
1. ✅ Database persistence (SQLite → PostgreSQL)
2. ✅ Google Calendar credentials configuration
3. ✅ Environment variable setup
4. ✅ Database adapter for local/production switching

## Railway Setup Steps:

### 1. Add PostgreSQL Database
In Railway dashboard:
- Click "Add Database" → "PostgreSQL" 
- Railway will automatically provide `DATABASE_URL` environment variable

### 2. Set Required Environment Variables
Add these variables in Railway project settings:

```bash
# Google Calendar Integration (CRITICAL)
GOOGLE_CALENDAR_CREDENTIALS={"type":"service_account","project_id":"your-project-id","private_key_id":"your-key-id","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n","client_email":"your-service-account@your-project.iam.gserviceaccount.com","client_id":"your-client-id","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs"}

# Calendar ID (Use your actual Google Calendar ID)
MAIN_CALENDAR_ID=janko.tank.poi@gmail.com

# Application Settings
NODE_ENV=production
PORT=3000

# Optional: SMS/WhatsApp notifications
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number
```

### 3. Get Google Calendar Credentials
1. Go to Google Cloud Console
2. Enable Google Calendar API
3. Create a Service Account
4. Download the JSON credentials file
5. Copy the entire JSON content into `GOOGLE_CALENDAR_CREDENTIALS` variable

### 4. Deploy to Railway
```bash
# Connect your repo to Railway and deploy
railway login
railway link [your-project-id]
railway up
```

### 5. Test Deployment
After deployment, test these endpoints:
- `https://your-railway-app.up.railway.app/health` - Should return healthy status
- `https://your-railway-app.up.railway.app/api/booking/appointment-types` - Should return appointment types

## Key Changes Made:

### Database Layer
- **Added PostgreSQL support**: `services/database-postgres.js`
- **Database adapter**: Automatically chooses SQLite (local) or PostgreSQL (production)
- **Environment detection**: Uses `DATABASE_URL` presence to determine database type

### Google Calendar
- **Fixed credentials loading**: Now properly reads from environment variable
- **Fallback calendar ID**: Uses your actual calendar ID instead of placeholder

### Production Optimizations
- **Error handling**: Graceful failures when Google Calendar is unavailable
- **Connection pooling**: Efficient database connection management
- **Environment-specific logging**: Reduced logging in production

## Troubleshooting:

### Database Issues
```bash
# Check if PostgreSQL is connected
railway logs | grep "PostgreSQL database initialized"
```

### Google Calendar Issues
```bash
# Check calendar credentials
railway logs | grep "Google Calendar"
```

### Environment Variables
```bash
# Verify environment variables are set
railway variables
```

## Testing the Fix:
1. Deploy to Railway with PostgreSQL database
2. Set the Google Calendar credentials environment variable
3. Test booking endpoint: `/api/booking/webhook`
4. Verify bookings persist across deployments
5. Check Google Calendar for created events

The main issue was that your SQLite database was being created in the container's ephemeral filesystem, so all data was lost on restart. PostgreSQL solves this by using Railway's persistent database service.