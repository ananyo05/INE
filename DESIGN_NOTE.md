# Design Note

## Why this document exists

Anyone can prompt an AI assistant for "a Playwright scraper with retry logic" and get code that compiles and looks reasonable. What's much harder to fake — and what this document is written to make visible — is the process of actually running that code against a real, adversarial target, deploying it to real infrastructure, and finding out where the first version was wrong. This note is organized around that process: not just what the system does, but what broke, how it was caught, and why the fix is correct rather than cosmetic.

## Reliability approach

The scraper is the least reliable part of this system by nature — it depends on a third-party page's DOM structure, timing, and anti-bot measures, all of which can shift between renders. The design assumes failure is normal, not exceptional, and is built around that assumption rather than around the happy path:

- **Retry with exponential backoff.** Each product gets up to 3 attempts (1s, 3s, 8s backoff) before being marked failed. This wasn't a theoretical nicety — production testing showed real products consistently timing out on attempt 1 and succeeding on attempt 2, a pattern that suggests the target site's WASM-based unlock challenge has real first-load initialization cost. Without retries, most legitimate scrapes would have been misreported as failures.
- **Transparent logging over silent failure.** Every scrape attempt — success, retry, or failure — is written to `scrape_log`, including the exact error message and retry count. Nothing is swallowed or summarized away.
- **Data integrity over completeness.** `price_history` is written only when a scrape produces a validated, positive numeric price. A failed or malformed scrape is recorded in the log only — never as a placeholder, zero, or null price in the history table. This is a deliberate constraint: it means every row in `price_history` is real, and the table can be trusted without cross-checking it against the log.
- **Sequential, not parallel, scraping.** Products are scraped one at a time. Slower, but it avoids hammering the target site or the host's own resource limits — an intentional throughput-for-stability trade-off appropriate for a scheduled background job.
- **Decoupling long jobs from the calling request.** A full batch scrape can run for minutes. Endpoints that trigger it are designed so that a caller with a short timeout (including third-party schedulers) doesn't need to hold a connection open for the full run.

## Why Playwright, not a lightweight fetch

The target mock store deliberately withholds price and stock data from the initial page load. Revealing the real price requires, in order: simulated human-like pointer movement over the price element (the store enforces a minimum move count and dwell time before the reveal control becomes interactive), a click on "Reveal price," and a client-side WASM challenge that must resolve before the real value is rendered. None of this is visible to a plain HTTP request — a real browser has to execute the page's JavaScript and interact with it. Playwright was chosen specifically because it can drive that interaction sequence, which `fetch`/`curl`-based scraping fundamentally cannot.

## What went wrong, and how each issue was actually found

Two application bugs and two deployment-environment issues surfaced during this project. All four are included here because each one has a specific, explainable mechanism — not just "it broke, then I changed something and it worked."

### 1. Matching a randomized class name instead of the actual signal (the significant one)

The real price value is rendered inside `.price-main`, alongside a decoy value that fades out as the real value fades in. The first version of the scraper targeted the real element by a specific CSS class observed during manual inspection. That looked correct — it worked in an initial spot-check.

It was wrong. The site randomizes that class on every render, specifically to defeat this exact scraping approach. The bug wasn't caught during that first manual test because a single run has a good chance of landing on the class name that happened to be observed once. It only surfaced under repeated, production-scale testing: roughly 3 of every 4 attempts succeeded, and the 4th consistently failed with "Malformed or missing price," even on a page that had clearly loaded correctly. A failure rate stuck between 0% and 100% was the signal that something was matching inconsistently, not something that was simply broken.

The fix replaces class-name matching with **behavior-based matching**: the scraper inspects every child of `.price-main` and selects whichever one has settled to `opacity >= 0.99`, matching on the fade-in behavior the site actually guarantees, instead of an implementation detail (the class name) the site explicitly randomizes to prevent this kind of scraping.

This is the most instructive bug in the project because the failure mode is easy to miss by design: it passes a casual test, and only fails statistically. Catching it required running the scraper enough times, and reading the failure rate as data rather than dismissing an intermittent failure as flakiness.

### 2. Supabase key format validation was out of date

The Supabase client's key validation only recognized the legacy `eyJ...` JWT format. Supabase has since introduced a `sb_secret_...` format for service keys, which the validation rejected as invalid even though it was a legitimate, working credential. This is a case of validation logic silently going stale as an upstream provider's conventions evolved — found immediately because a *correct* key was being rejected outright, not a subtle bug, but worth noting because it's the kind of failure that's easy to misdiagnose as "the key is wrong" rather than "the check is wrong."

### 3. Playwright's browser binary wasn't available at runtime (deployment)

The Render build step downloaded Chromium successfully, but the default install path is an OS-level cache directory that isn't guaranteed to persist from the build container into the runtime container. Every scrape failed at runtime with "Executable doesn't exist," despite a clean build log. The fix — `PLAYWRIGHT_BROWSERS_PATH=0`, which installs the browser inside `node_modules` (a path that does persist into runtime) — required distinguishing a build-time success from a runtime-availability problem, which aren't the same thing and don't show up in the same log.

### 4. A cron-triggered request exceeded the scheduler's timeout (deployment)

A full batch scrape, with retries across 6 products, can take several minutes. The external cron scheduler gave up waiting on the HTTP response well before the backend had actually finished working through the batch — even though the backend was behaving correctly the whole time. This is a standard consequence of wrapping a long background job in a synchronous request, and it was diagnosed by checking Render's live logs *in parallel* with the failing request, confirming the job was still progressing rather than assuming the timeout meant the endpoint was broken.

## Security note

An early version of the frontend sent the scraper's `CRON_SECRET` from the browser as a bearer token, via a `VITE_`-prefixed environment variable. Vite bundles all `VITE_*` variables into public client-side JavaScript by design, so that secret would have been visible to anyone inspecting the deployed site's source — a real credential leak, not a style issue. The fix split the single endpoint's two responsibilities: `/api/scrape/run` stays behind the cron-secret check exclusively for the scheduled job, and a new endpoint, `/api/scrape/trigger-manual`, handles the frontend's manual-refresh button with no secret involved at all. The secret was also rotated after an earlier, unrelated incident where `.env` was briefly committed to the repository.

## On the use of AI in building this

AI assistance was used throughout this project, and that's stated plainly rather than obscured, because the more relevant question isn't whether AI was used but what was verified. Every fix described above was found by running the actual system against the actual target and reading real failure evidence — a statistically inconsistent success rate, a runtime error that a clean build log didn't predict, a scheduler timeout that live logs proved was a false negative — not by asking an AI once and shipping the first answer. The value demonstrated here is in the debugging: recognizing when a first attempt is subtly wrong, tracing a failure to its actual mechanism, and being able to explain why a fix works rather than just that it does.
