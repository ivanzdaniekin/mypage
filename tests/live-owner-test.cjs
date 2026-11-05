// Retired: automated production Turnstile can fail with 600010, even in headed Chrome.
// Do not inject TEST_KEY or intercept production resources to revive this runner.
console.error('STOP: use ordinary Chrome and docs/MANUAL-FORM-TEST.md. This legacy runner sends no requests.');
process.exitCode=1;
