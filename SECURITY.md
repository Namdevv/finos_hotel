# Security Policy

FinOS Hotel processes receipt/ledger images and internal financial data, so please report vulnerabilities via private channels instead of creating a public issue.

## Reporting a Vulnerability

Send an email to `namtran34311@gmail.com` with a subject starting with `[SECURITY] FinOS Hotel`.

Please include:

- A brief description of the vulnerability and its impact.
- Minimal steps to reproduce the issue.
- Relevant commit/tag version or deployment environment.
- Necessary proof of concept (do not send real hotel data unless absolutely required).

## Priority Scope

- Authentication/authorization bypass or leakage.
- Unauthorized access to uploaded images, database, or transaction data.
- Bugs allowing ledger entries to be written without human review.
- RCE, path traversal, SSRF, or malicious file uploads.
- Exposure of secrets, tokens, passwords, or deployment configurations.

## Deployment Recommendations

- Always change `FINOS_SECRET_KEY` and `FINOS_ADMIN_PASSWORD` before production use.
- Do not publish `.env`, database, `/data` volumes, uploaded images, or production logs.
- Use HTTPS if accessing outside `localhost`, especially when using the camera/PWA via browsers.
- Restrict access to `FINOS_OLLAMA_HOST` within trusted networks; do not expose the model service to the Internet without a dedicated protection layer.
- Back up and control access to the volume containing SQLite/uploaded images as you would with real financial data.
