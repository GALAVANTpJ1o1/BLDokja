# Android and Shared Deployment

## Architecture

The website is a Flask app backed by `letterpairs.db`. The Android app does not open that SQLite file directly. It calls the Flask JSON API, and Flask remains the single writer for the central database.

Shared data flow:

1. Website form or Android action sends a request to Flask.
2. Flask validates the pair and word.
3. Flask writes to `pair_words`.
4. Website pages, memo review, heatmap, and Android API reads all use the updated data.

No new database tables or fields were added.

## New API Endpoints

- `GET /api/pairs/random`
  - Returns a practice pair: `{"pair":"AB"}`.
- `GET /api/pairs/<pair>/words`
  - Returns all words for a pair plus the most common word.
- `GET /api/words?q=search`
  - Returns saved database words.
- `POST /api/words`
  - JSON body: `{"pair":"AB","word":"abacus"}`.
  - Adds a new word or increments an existing pair/word count.
- `DELETE /api/words/<id>`
  - Deletes one word row.

Mutating API requests are open in local development. Set `API_TOKEN` in production to require:

```text
Authorization: Bearer your-token
```

## Android App Stack

The Android app in `android/` is a native Java Android app using only platform APIs:

- Java Activity UI
- `HttpURLConnection` for API calls
- `org.json` for JSON parsing
- Android Gradle Plugin build

This avoids adding a JavaScript mobile stack or third-party mobile dependencies to a simple Flask project.

## Build and Run the Android App

Prerequisites:

1. Install Android Studio.
2. Install Android SDK Platform 35 from Android Studio SDK Manager.
3. Open the `android/` folder in Android Studio.
4. Let Android Studio sync Gradle dependencies.

For local emulator development with Flask running on your computer:

```powershell
cd C:\Users\shivk\OneDrive\Desktop\LetterPairTrainer
$env:FLASK_APP="app.py"
& "C:\Users\shivk\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m flask run --host 0.0.0.0 --port 5000
```

The Android default API URL is `http://10.0.2.2:5000`, which is the emulator route back to your computer.

For a real phone on the same Wi-Fi during development, set the API URL to your computer LAN IP:

```properties
LETTER_PAIR_API_BASE_URL=http://192.168.1.25:5000
```

Put that in `android/gradle.properties` or pass it on the command line:

```powershell
.\gradlew assembleDebug -PLETTER_PAIR_API_BASE_URL=http://192.168.1.25:5000
```

For production:

```properties
LETTER_PAIR_API_BASE_URL=https://your-domain.example
LETTER_PAIR_API_TOKEN=your-token
```

Then build from Android Studio or:

```powershell
cd android
.\gradlew assembleDebug
```

## Deployment Requirements

To make the app work without USB or local Wi-Fi, deploy the Flask backend to a public HTTPS URL.

Recommended minimum setup:

1. Host Flask on a service that supports persistent storage or a managed database.
2. Set `SECRET_KEY` to a long random value.
3. Set `API_TOKEN` so Android write/delete requests require a bearer token.
4. Set `ALLOWED_API_ORIGINS` to your website origin if browser clients call `/api`.
5. Use HTTPS. Android production builds should use `https://...`, not local HTTP.
6. Keep `letterpairs.db` on persistent storage, or migrate `pair_words`, `memo_attempts`, and `app_settings` to a managed SQL database.

SQLite is acceptable for a small personal deployment only if the host gives you persistent disk and one app instance. For multi-instance hosting or heavier use, migrate to Postgres and update `get_db()` plus SQL parameter handling accordingly.

Example production environment:

```text
SECRET_KEY=replace-with-random-secret
API_TOKEN=replace-with-random-api-token
ALLOWED_API_ORIGINS=https://your-domain.example
```

The Android app must be rebuilt with `LETTER_PAIR_API_BASE_URL` pointing at the deployed HTTPS domain.
