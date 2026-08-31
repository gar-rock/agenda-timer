# Agenda Timer

Agenda Timer is a very simple static web app that runs 100% in the browser.
It accepts an agenda in JSON format, runs a countdown for each topic/subtopic,
and automatically moves to the next subtopic when time expires.

No server is required, so this can be hosted directly in an AWS S3 static website bucket.

## Features

- Browser-only app (HTML/CSS/JS)
- JSON agenda input
- Topic and subtopic timing
- Auto-advance to next segment when time reaches zero
- Color states by time used in the current segment:
	- Green: first 75%
	- Yellow: next 20%
	- Red: last 5%
- Pause and resume controls
- State persistence with `localStorage` so timer state can recover after closing/reopening the tab

## Run Locally

Because this is static, open `index.html` in a browser, or run any simple static server.

Example with Python:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## JSON Format

Durations are in minutes.

```json
{
	"title": "Weekly Product Sync",
	"items": [
		{
			"topic": "Introductions",
			"durationMinutes": 3
		},
		{
			"topic": "Project Updates",
			"durationMinutes": 12,
			"subtopics": [
				{ "topic": "Frontend", "durationMinutes": 5 },
				{ "topic": "Backend", "durationMinutes": 4 },
				{ "topic": "QA", "durationMinutes": 3 }
			]
		}
	]
}
```

Notes:

- If a topic has subtopics, each subtopic is timed in order.
- If a topic has no subtopics, that topic is timed directly.

## Deploy To AWS S3 (Static Website)

1. Create an S3 bucket for static hosting.
2. Enable static website hosting on the bucket.
3. Upload these files to bucket root:
	 - `index.html`
	 - `styles.css`
	 - `app.js`
4. Set bucket policy/public access settings according to your security model.
5. Open the S3 website endpoint URL.

## Files

- `index.html`: App layout and controls
- `styles.css`: Styling and responsive layout
- `app.js`: Agenda parsing, timer engine, persistence, and UI updates