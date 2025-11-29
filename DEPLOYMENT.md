# Deployment Guide for Render.com

This guide explains how to deploy the code-connect application to Render.com.

## Quick Deploy

### Option 1: Using render.yaml (Recommended)

1. **Push your code to GitHub** (already done)

2. **Go to Render Dashboard**: https://dashboard.render.com/

3. **Click "New +"** → **"Blueprint"**

4. **Connect your GitHub repository**: `m-umar-raza/code-connect`

5. **Render will automatically detect** the `render.yaml` file and configure everything

6. **Click "Apply"** and wait for deployment

### Option 2: Manual Configuration

1. **Go to Render Dashboard**: https://dashboard.render.com/

2. **Click "New +"** → **"Web Service"**

3. **Connect your GitHub repository**: `m-umar-raza/code-connect`

4. **Configure the following settings**:

   - **Name**: `code-connect`
   - **Region**: Choose your preferred region
   - **Branch**: `main`
   - **Root Directory**: Leave empty (root)
   - **Runtime**: `Node`
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && node src/index.js`

5. **Add Environment Variables**:

   Click "Advanced" → "Add Environment Variable":

   ```
   NODE_VERSION=22.16.0
   PORT=3000
   LIBRETRANSLATE_ENDPOINT=https://libretranslate.com/translate
   ```

   Optional (for Whisper):
   ```
   WHISPER_ENDPOINT=http://localhost:8000/v1/audio/transcriptions
   OPENAI_API_KEY=your_api_key_here  # If using OpenAI Whisper
   ```

6. **Click "Create Web Service"**

7. **Wait for deployment** (first deploy takes 2-3 minutes)

## Important Notes

### Project Structure
The project has this structure:
```
code-connect/
├── package.json          # Root package.json for Render
├── render.yaml           # Render deployment configuration
├── client/               # Frontend files (served statically)
├── server/               # Backend Node.js application
│   ├── package.json      # Server dependencies
│   └── src/
│       ├── index.js      # Main server file
│       └── transcription.js
└── README.md
```

### Why We Need Root package.json

Render.com deploys from the repository root, but our Node.js server is in the `server/` subdirectory. The root `package.json` handles this by:
- Running `cd server && npm install` during build
- Running `cd server && node src/index.js` to start

### Whisper Configuration

**Important**: The deployed app will use LibreTranslate for translation, but Whisper transcription won't work by default because:

1. **Local Whisper** requires running a separate server (not feasible on Render's free tier)
2. **OpenAI Whisper API** requires an API key (paid service)

**Recommended Solutions**:

**Option A: Use OpenAI Whisper API** (Easiest)
1. Get API key from https://platform.openai.com/
2. Add environment variable in Render:
   ```
   WHISPER_ENDPOINT=https://api.openai.com/v1/audio/transcriptions
   OPENAI_API_KEY=sk-your-api-key-here
   ```

**Option B: Deploy Whisper Separately**
1. Deploy a Whisper server on a separate service (e.g., Hugging Face Spaces, Railway)
2. Update `WHISPER_ENDPOINT` to point to that server

**Option C: Disable Captions Temporarily**
- The app will still work for video calls, chat, and all other features
- Captions button can be hidden or show an error message

### Free Tier Limitations

Render.com free tier includes:
- ✅ Automatic deploys from GitHub
- ✅ HTTPS/SSL certificate
- ✅ 750 hours/month runtime
- ⚠️ App sleeps after 15 minutes of inactivity (cold start takes ~30s)
- ⚠️ Limited CPU/memory

For production use, consider upgrading to a paid tier.

## Troubleshooting

### Error: Cannot find module
**Problem**: `Error: Cannot find module '/opt/render/project/src/src/index.js'`

**Solution**: Make sure you're using the correct start command:
- ✅ Correct: `cd server && node src/index.js`
- ❌ Wrong: `node src/index.js` (this looks in wrong directory)

### Build Fails
- Check that `server/package.json` exists and has all dependencies
- Verify Node.js version (should be 18+)
- Check build logs for specific errors

### App Doesn't Load
- Check that PORT environment variable is set (Render sets this automatically)
- Verify all environment variables are configured
- Check application logs in Render dashboard

### WebRTC Connection Issues
- Make sure HTTPS is enabled (Render provides this automatically)
- WebRTC requires HTTPS for getUserMedia API
- Check browser console for errors

### Captions Not Working
- Verify `WHISPER_ENDPOINT` is set and accessible
- Check if you need `OPENAI_API_KEY` for OpenAI API
- Look at server logs for transcription errors
- Translation will work with public LibreTranslate endpoint

## Post-Deployment

After successful deployment:

1. **Get your URL**: `https://code-connect.onrender.com` (or your custom domain)

2. **Test the app**:
   - Open the URL
   - Allow camera/microphone permissions
   - Create a meeting
   - Test video/audio
   - Try chat features
   - Test captions (if configured)

3. **Share with users**: Give them your Render URL

4. **Monitor**: Check Render dashboard for:
   - Application logs
   - Performance metrics
   - Error reports

## Custom Domain (Optional)

To use your own domain:

1. Go to your service in Render dashboard
2. Click "Settings" → "Custom Domain"
3. Add your domain
4. Update DNS records as instructed
5. Wait for SSL certificate (automatic, takes ~5 minutes)

## Automatic Deploys

Render automatically deploys when you push to GitHub:

1. Make changes locally
2. Commit: `git commit -m "your message"`
3. Push: `git push origin main`
4. Render automatically detects and deploys
5. Check dashboard for deployment status

## Cost Optimization

**For Free Tier**:
- App sleeps after 15 minutes inactivity
- Use a service like UptimeRobot to ping your app every 5 minutes (keeps it awake)

**For Production**:
- Upgrade to paid tier ($7/month) for:
  - Always-on
  - More resources
  - Better performance
  - Multiple instances

## Support

- Render Docs: https://render.com/docs
- Render Community: https://community.render.com/
- Project Issues: https://github.com/m-umar-raza/code-connect/issues
