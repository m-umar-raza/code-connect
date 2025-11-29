# Whisper + LibreTranslate Setup Guide

This document explains how to set up local Whisper transcription and LibreTranslate for the caption system.

## Architecture Overview

The new caption system works as follows:

1. **Client** captures audio from microphone using MediaRecorder API
2. **Audio chunks** are sent to the backend via Socket.io every 1 second
3. **Backend** accumulates chunks and processes them every 2 seconds using Whisper
4. **Transcribed text** is optionally translated using LibreTranslate
5. **Results** are broadcast back to all clients in the room

## Option 1: Local Whisper (Recommended for Privacy)

### Using faster-whisper (Python)

1. **Install faster-whisper**:
```bash
pip install faster-whisper
```

2. **Create a simple Whisper API server** (`whisper-server.py`):
```python
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel
import tempfile
import os

app = Flask(__name__)

# Load model once at startup (use 'tiny', 'base', 'small', 'medium', or 'large-v2')
model = WhisperModel("base", device="cpu", compute_type="int8")

@app.route('/v1/audio/transcriptions', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    audio_file = request.files['file']
    
    # Save temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as tmp:
        audio_file.save(tmp.name)
        tmp_path = tmp.name
    
    try:
        # Transcribe
        segments, info = model.transcribe(tmp_path, language="en")
        text = " ".join([segment.text for segment in segments])
        
        return jsonify({'text': text.strip()})
    finally:
        os.unlink(tmp_path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
```

3. **Install Flask**:
```bash
pip install flask
```

4. **Run the server**:
```bash
python whisper-server.py
```

### Using whisper.cpp (C++)

1. **Clone and build**:
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make

# Download model
bash ./models/download-ggml-model.sh base.en
```

2. **Run as server**:
```bash
./server -m models/ggml-base.en.bin --port 8000
```

3. **Configure endpoint** in `.env`:
```
WHISPER_ENDPOINT=http://localhost:8000/inference
```

## Option 2: OpenAI Whisper API (Cloud, Paid)

1. **Get API key** from https://platform.openai.com/

2. **Configure in `.env`**:
```env
WHISPER_ENDPOINT=https://api.openai.com/v1/audio/transcriptions
OPENAI_API_KEY=sk-your-api-key-here
```

## LibreTranslate Setup

### Option 1: Use Public Instance (Free, Limited)

Already configured by default:
```env
LIBRETRANSLATE_ENDPOINT=https://libretranslate.com/translate
```

### Option 2: Self-Hosted (Recommended for Production)

1. **Using Docker**:
```bash
docker run -d -p 5000:5000 libretranslate/libretranslate
```

2. **Configure in `.env`**:
```env
LIBRETRANSLATE_ENDPOINT=http://localhost:5000/translate
```

3. **With API key** (if enabled):
```env
LIBRETRANSLATE_API_KEY=your_api_key_here
```

## Testing the Setup

1. **Start your local Whisper server** (if using local)

2. **Copy and configure `.env`**:
```bash
cd server
cp .env.example .env
# Edit .env with your endpoints
```

3. **Start the Node.js server**:
```bash
npm start
```

4. **Open the app** at http://localhost:3000

5. **Test captions**:
   - Join a room
   - Click the "Captions" button
   - Speak into your microphone
   - You should see transcribed text appear

6. **Test translation**:
   - Enable captions
   - Select a target language from the dropdown
   - Speak in English
   - You should see both original and translated text

## Troubleshooting

### Whisper endpoint not available
- Check if your Whisper server is running
- Verify the endpoint URL in `.env`
- Check server logs for connection errors

### Audio not being captured
- Check browser permissions for microphone
- Ensure HTTPS or localhost (required for MediaRecorder)
- Check browser console for errors

### Translation not working
- Verify LibreTranslate endpoint is accessible
- Check if the target language is supported
- Look for errors in server logs

### Poor transcription quality
- Use a better Whisper model (`small`, `medium`, or `large-v2`)
- Ensure good microphone quality
- Reduce background noise

## Performance Tips

1. **Model selection**:
   - `tiny`: Fastest, lowest quality
   - `base`: Good balance for real-time (Recommended)
   - `small`: Better quality, slower
   - `medium/large`: Best quality, requires GPU

2. **GPU acceleration**:
   ```python
   # In whisper-server.py, change:
   model = WhisperModel("base", device="cuda", compute_type="float16")
   ```

3. **Adjust processing interval**:
   In `server/src/transcription.js`, change the interval (default 2000ms):
   ```javascript
   const interval = setInterval(async () => {
       // ... transcription code
   }, 2000); // Adjust this value
   ```

## Supported Languages

LibreTranslate supports translation between many languages including:
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Russian (ru)
- Japanese (ja)
- Korean (ko)
- Chinese (zh)
- Arabic (ar)
- Hindi (hi)

And many more. Check the LibreTranslate instance for the full list.

## Security Notes

- Use environment variables for API keys, never commit them
- Consider rate limiting for production
- Self-host services for sensitive content
- Use HTTPS in production for secure audio transmission
