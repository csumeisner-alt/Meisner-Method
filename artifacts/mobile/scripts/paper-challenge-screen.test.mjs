import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../app/paper.tsx", import.meta.url), "utf8");
const events = readFileSync(new URL("../components/PaperChallengeHistory.tsx", import.meta.url), "utf8");
const challenge = readFileSync(new URL("../lib/paperChallenge.ts", import.meta.url), "utf8");

assert.match(events, /eventWindow\.phase === 'upcoming' \? eventWindow\.startAtMs : Date\.now\(\)/);
assert.match(events, /eventWindow\.phase === 'upcoming' \? null : PAPER_CHALLENGE_STARTING_BALANCE/);
assert.match(events, /currentWindow\.phase === 'active' \|\| currentWindow\.phase === 'upcoming'/);
assert.match(events, /separate \$100,000 event portfolio/);
assert.match(screen, /capturePaperChallengeBaseline\(latestStore\.enrollment, startEquity\)/);
assert.match(challenge, /joinedAtMs: enrollment\.eventStartAtMs/);
assert.match(screen, /enrollment\.startEquity === null/);
assert.match(screen, /paperChallengeWindow\.phase === 'active' && paperChallengeRef\.current\.enrollment\?\.accountId === id/);
