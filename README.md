# Avatar Bulletin · 

A bilingual newsroom for any presenter. Choose a character and voice, then produce a bulletin from your own sources. The operator console is at `/`, the English edition is at `/en/index.html`, and the audience player is at `/watch`.

Anyone can choose **Operator sign-in → Create a personal studio**. Save the generated access code in a password manager. That code grants access to your studio from another device. Each studio has its own encrypted provider settings, rundown and audience link. Share the viewer link from your studio with your audience. The deployment owner can also sign in with the configured operator password. The optional Vercel AI Gateway drafting feature is available to that owner; personal studios can use local extraction. Live broadcasts may incur hosting and provider charges.

## First bulletin

1. Open the studio and choose **enter provider**. The published studio has its own operator password.
2. Choose **pro connect**. Enter the Runway Developer API key, save, then fetch the Characters available to that API project. Select your character or enter an existing preset ID. Save the selection.
3. Save the ElevenLabs API key and select its voice. Enter the LiveKit Cloud project URL (`wss://…livekit.cloud`), API key and secret. Its grants must support room management and agent dispatch. The server returns only configuration flags and non-secret settings.
4. In the researcher view, collect RSS candidates or add a story with a source and notes. Select the story in the manager view. In the editor, review the evidence, edit the script and approve it. The local excerpt mode has no inference charge. The optional AI rewriting action sends the selected notes to Vercel AI Gateway only after operator confirmation.
5. In production, build a rundown or request a timed suggestion. Rehearsal uses local sample data. **live** opens the cost confirmation for an actual session. Viewers can enter the waiting room, then receive synchronized video and audio from the avatar.

## How a live segment travels

| Component | Responsibility |
| --- | --- |
| Researcher, bulletin manager and editor | Collect sourced candidates, select stories, draft, approve and revision each segment. |
| Production director | Suggest a rundown within a target duration, apply the operator's edits, and insert a breaking story at the next available boundary. |
| Server API | Authenticate operators, store provider keys in an encrypted private Vercel Blob, enforce revisions, atomically reserve a broadcast, and issue subscribe-only audience tokens. |
| LiveKit Agents worker | Join a uniquely named room, lease the next approved revision, prepare a clip ahead of playback, and report progress and completion. |
| ElevenLabs | Generate the selected voice from the approved Arabic script. |
| Runway Character | Animate the selected face from the supplied voice using LiveKit's AvatarSession. |
| Audience | Receive the same shared broadcast. Closing the producer's tab does not end the worker. |

Editing, saving credentials and text-only rehearsal do not launch the three media services. Runway Developer API credits, ElevenLabs usage, LiveKit usage and Vercel Sandbox compute may apply to a real broadcast. A ready custom Character or preset and an authorized voice must already exist. Runway's web-app and API balances are separate. This version caps one avatar session at five minutes. Initial worker startup can take around two minutes. The producer can reprioritize unleased material while the hosted broadcast is running. A segment already leased for playback or preloading is protected against changes.

## Local development

Use Node.js 24. From the application directory run `npm ci`, `npm ci --prefix worker`, `npm run build` and `npm run dev`. The server binds to localhost. To enable operator persistence locally, copy `.env.example` to `.env.local`, generate a unique operator password, two separate random 32-byte base64url secrets and set an absolute local file path outside the public directory in `BULLETIN_LOCAL_STORE`. Run `npm test` for isolated server and worker regression tests. These tests use synthetic credentials and supplied audio frames.

Production requires `ADMIN_PASSWORD`, `STUDIO_SECRET`, `BULLETIN_WORKER_SECRET` and a connected private Blob store. The build bundles the browser client and the server-side Sandbox SDK and packages an allowlisted set of worker files. Project OIDC authorizes Vercel Sandbox. The optional AI editor uses the Vercel project's AI Gateway entitlement. To run a standing worker locally, set its matching LiveKit credentials and shared worker secret and run `npm start` in `worker/`. The standing worker uses the approved rundown snapshot.
