import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Config (override with -e KEY=value). Defaults mirror seatlock's own loadtest.
const BASE = __ENV.BASE_URL || 'http://localhost:8080';
const SEATS = parseInt(__ENV.SEATS || '50', 10);
const VUS = parseInt(__ENV.VUS || '200', 10);
const CONTEND = (__ENV.CONTEND || 'false') === 'true';

// Custom metrics
const booked = new Counter('seatlock_booked');
const conflicts = new Counter('seatlock_conflicts');
const otherResp = new Counter('seatlock_other');
const confirmMs = new Trend('seatlock_confirm_ms', true);

export const options = {
    scenarios: {
        burst: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: 1,
            maxDuration: '60s',
        },
    },
    thresholds: {
        seatlock_confirm_ms: ['p(95)<500'], // the latency SLO target, informational
    },
};

// Sign up one user and share its token across all VUs.
export function setup() {
    const email = `loadgen+${Date.now()}@test.com`;
    const res = http.post(
        `${BASE}/v1/auth/signup`,
        JSON.stringify({ email, password: 'supersecret123' }),
        { headers: { 'Content-Type': 'application/json' } },
    );
    check(res, { 'signup returned 201': (r) => r.status === 201 });
    return { token: res.json('token') };
}

export default function (data) {
    const headers = { Authorization: `Bearer ${data.token}` };
    const seatID = CONTEND ? 1 : ((__VU - 1) % SEATS) + 1;

    // Step 1: hold the seat (status ignored, like seatlock's own loadtest)
    http.post(`${BASE}/v1/seats/${seatID}/hold`, null, { headers });

    // Step 2: confirm — this is the measured request
    const res = http.post(`${BASE}/v1/seats/${seatID}/confirm`, null, { headers });
    confirmMs.add(res.timings.duration);

    if (res.status === 201) {
        booked.add(1);
    } else if (res.status === 409 || res.status === 422) {
        conflicts.add(1);
    } else {
        otherResp.add(1);
    }
}