# Contributing to FinOS Hotel

Thank you for your interest in FinOS Hotel. The project prioritizes small, well-targeted, testable changes that adhere to the core principle: OCR only pre-fills data; a human must always review before writing to the accounting ledger.

## Getting Started

1. Fork the repo and create a new branch from `main`.
2. Run backend/frontend according to the instructions in `README.md`.
3. For the backend on Windows, enable UTF-8 when running the smoke test:

```powershell
$env:PYTHONUTF8=1; .\.venv\Scripts\python.exe -m tests.smoke_test
```

4. For the frontend:

```powershell
cd frontend
npm install
npm run build
```

## Change Guidelines

- Maintain documentation, comments, and UI in English.
- Do not commit `.env`, databases, real uploaded images, logs, or real hotel data.
- Do not let OCR write directly to the `transactions` table; all data from the model must go through the review screen.
- For backend changes, run the smoke test. For frontend changes, run `npm run build`.
- Pull requests should be brief: describe the problem, the fix, how it was tested, and include screenshots if UI is changed.

## Sample Data

Use only dummy data or images that have been stripped of identifiable information. If you need to illustrate an OCR error, mask guest names, phone numbers, booking codes, and any sensitive financial data.
