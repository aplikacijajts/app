# Trucking Portal (Express + JSON Store)

## Run
1. `npm i`
2. `npm start`
3. Open: http://localhost:4000

## Default admin (auto-created on first start)
- Email: admin@local
- Password: admin123

## Notes
- Data is stored in `/data/*.json`
- Uploaded files are stored in `/uploads/documents/YYYY/MM/`
- Files are served securely via: `/api/documents/:id/file` (permission-checked)
- Required docs for loads: POD + BOL (computed in `/api/loads/all`)
