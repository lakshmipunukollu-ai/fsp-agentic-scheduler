# Manual testing guide (demo / hiring prep)

## 1. One-time setup

Run **`make`** targets from the **repository root** (`fsp-agentic-scheduler/`), not from `backend/` — unless you use the **backend Makefile** (see below).

**Important:** Do **not** put `# comments` on the **same line** as `make …`. GNU Make treats words after `make` as extra targets, so `make migrate # comment` tries to build a target named `#` and fails with `No rule to make target '#'`. Put comments on the **line above**, or run only `make migrate` with nothing after it.

```bash
cd /path/to/fsp-agentic-scheduler

make install
make migrate
make seed
```

**If your terminal is already in `backend/`**, either:

```bash
cd .. && make install && make migrate && make seed
```

or use **npm** (same effect):

```bash
npm install
npm run migrate
npm run seed
```

Or from `backend/` only: `make install`, `make migrate`, `make seed` (uses `backend/Makefile`).

Ensure PostgreSQL is running and `DATABASE_URL` (or `DB_*` vars) in `.env` match your DB.

**Student schedule AI** needs a real key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

**Twilio SMS** (optional): set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. For staff texts on schedule submit, add `users.phone` for admin/dispatcher and/or `TWILIO_STAFF_NOTIFY_NUMBERS`. Trial accounts must verify destination numbers in Twilio.

**Fast local iteration (no real SMS/email):** add `NOTIFICATIONS_LOG_ONLY=true` to `.env`. Approval SMS, approval email, staff “schedule submitted” SMS, and **student transactional emails** (cancel, draft ready, submit, schedule approved) are printed in the **backend terminal** only—no Twilio or SMTP calls. Remove or set to `false` when you want real sends.

**Student transactional email** (real SMTP): With `SMTP_*` set and `NOTIFICATIONS_LOG_ONLY` unset/false, the API emails the student’s `users.email` immediately on cancel / AI draft / submit / staff approval—unless they disabled email in portal preferences (`notification_email`).

Quick check (uses seeded DB; sets log-only inside the script):

```bash
cd backend && npm run test:notifications:log
```

```bash
# Terminal 1 — API (default http://localhost:3001)
make dev

# Terminal 2 — UI (http://localhost:5001, proxies /api to backend)
cd frontend && npm run dev
```

Open **http://localhost:5001**.

---

## 2. Demo logins (after `make seed`)

| Role | Email | Password |
|------|--------|----------|
| Admin | admin@skyhigh.com | admin123 |
| Dispatcher (scheduler) | dispatcher@skyhigh.com | scheduler123 |
| Student (Emma) | emma@skyhigh.com | student123 |

All share the same **operator** (SkyHigh), so notifications and SSE match.

---

## 3. What to verify (checklist)

### A. Student portal — school + Part 141/61

1. Log in as **emma@skyhigh.com**.
2. Header should show **school name** (e.g. SkyHigh Flight School) and **Part 141** or **Part 61** badge from the operator.
3. In another browser (or after logout), log in as **admin**, open **Analysis**, toggle **School Mode** Part 141 ↔ Part 61, save.
4. Refresh student portal — badge should match.
5. In **Part 61**, you should see the **Part 61 tiered support** card under Pilot resources.

### B. AI schedule → submit → staff

1. Student → **Request Schedule** tab.
2. Enable some availability days, pick goal hours, **Generate** (needs `ANTHROPIC_API_KEY`).
3. Edit/remove slots if you like → **Submit for approval**.
4. Log in as **admin** or **dispatcher** → **Approval Queue** should list the related item; **notification bell** may show an in-app alert.
5. If Twilio + staff numbers are configured, check phones for a **staff SMS** (submit only; cancel is in-app unless you extend it).

### C. Student cancel → notify → fill suggestion

1. Student → **My Calendar** → tap a **future** lesson with status **confirmed** → **Cancel this lesson** → confirm.
2. Staff (admin/dispatcher): **in-app notification**; **Activity feed** / audit should show **Student cancelled lesson**.
3. **Approval Queue**: a new **waitlist**-style suggestion may appear (another student prioritized for that slot) if the seed has **more than one** student on the operator.

### D. Admin “simulate cancellation”

1. Log in as **admin** or **dispatcher** → **Dashboard** or **Analysis** tab.
2. Use the **Simulate cancellation** control (calls `POST /api/analysis/simulate-cancellation`).
3. **Approval Queue** gains a suggestion; SSE may fire (Dashboard listens for cancellation events).

### E. Approve suggestion → student SMS + email (optional)

Approvals only send **SMS**/**email** when the suggestion’s `studentId` is a **real user UUID** (e.g. from **Request Schedule**), not the demo IDs like `STU-101` in seeded rows.

1. **Put your Twilio-verified cell on the student** (E.164), e.g. after `make seed`:
   ```sql
   UPDATE users SET phone = '+15551234567' WHERE email = 'emma@skyhigh.com';
   ```
2. **Student:** Request Schedule → Generate → **Submit for approval** (creates a pending suggestion tied to Emma’s user id).
3. **Dispatcher:** Approve that item in **Approval Queue**.
4. **SMS:** With Twilio env vars set and `users.phone` present, the student should receive `NotificationService.sendApprovalSMS`. Check backend logs if not.
5. **Email:** Set **SMTP** vars (see below). On approve, an email goes to the student’s `users.email` unless they turned off email in notification preferences.

### F. Smoke tests (no UI)

**Twilio (credentials + verified destination number):**

```bash
cd backend && npm run test:sms -- +1YOUR_VERIFIED_NUMBER
```

**SMTP — easiest first (no Gmail, no `.env` SMTP):**

```bash
cd backend && npm run test:email:demo
```

Opens a **preview URL** in the terminal (Ethereal fake inbox) — confirms nodemailer works.

**Real inbox (Gmail App Password in `.env`):**

```bash
cd backend && npm run test:email -- you@example.com
```

Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `.env` (optional: `SMTP_PORT`, `SMTP_FROM`). Use `TEST_EMAIL_TO` instead of the CLI arg if you prefer.

**If the command fails:**

- **`zsh: missing end of string`** — Do not break the address across lines. Use one line, or quotes: `npm run test:email -- 'you@gmail.com'`.
- **`Missing SMTP env vars`** — Add the variables to `.env` in the **repo root** or **`backend/`** (the script loads both). For **Gmail**, use an [App Password](https://support.google.com/accounts/answer/185833) (not your normal login password), e.g. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, and set `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` to your Gmail address.

### G. Staff SMS when student submits a schedule

1. Set Twilio vars.
2. Set `users.phone` for **admin** and/or **dispatcher**, **or** set `TWILIO_STAFF_NOTIFY_NUMBERS` to comma-separated E.164 numbers.
3. Student submits a finalized schedule → staff receive `sendStaffStudentScheduleSubmittedSMS`.

---

## 4. Quick API checks (optional)

```bash
# Health
curl -s http://localhost:3001/health | jq .

# Login, then use Bearer token
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"emma@skyhigh.com","password":"student123"}' | jq -r .token
```

---

## 5. Common issues

| Symptom | Fix |
|---------|-----|
| `401` / login fails | Run `make seed`; check same operator |
| AI schedule fails | Set `ANTHROPIC_API_KEY`, restart backend |
| No SMS | Twilio env unset (expected in dev) or trial number not verified |
| No email on approve | Set `SMTP_*` in `.env`; run `npm run test:email` first; ensure student did not disable email in portal prefs |
| No second student for cancel-fill | Seed creates many students; ensure DB seeded and cancel as a user who has future `confirmed` lessons |
| **`student_profiles_user_id_unique` already exists** | Fixed in migration `002` (idempotent). Pull latest, then `make migrate` again. |
| **`EADDRINUSE` on port 3001** | Port busy — usually a previous backend still running. Quit that terminal or run `kill $(lsof -ti:3001)` (macOS), then start the server again. |
| **`No rule to make target '#'`** | You ran `make` with `# something` on the **same line**. Shell does not strip that for `make` — use `make migrate` alone, or put the comment on the **previous** line. |


---

## 6. Automated tests

```bash
cd backend && npm test
cd frontend && npm run build
```
