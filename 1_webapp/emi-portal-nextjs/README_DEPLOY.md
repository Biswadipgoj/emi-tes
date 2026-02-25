# TelePoint EMI Portal — Deployment Guide

## Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- Vercel account

---

## Step 1: Supabase Setup

### A. Run the Full Schema
In your Supabase project → **SQL Editor**, paste and run:
```
migrations/999_full_schema.sql
```
This creates all tables, RLS policies, functions, and triggers.

### B. Run the Incremental Migration
After the full schema, also run:
```
supabase_migration.sql
```
This adds the `retailers.mobile` column and additional payment_request columns.

### C. Create Admin User
1. Go to Supabase → **Authentication → Users → Add User**
2. Create user with email: `telepoint@admin.local` (or your preferred email)
3. Set a strong password
4. Then in SQL Editor, run:
```sql
INSERT INTO profiles (user_id, role)
SELECT id, 'super_admin'
FROM auth.users
WHERE email = 'telepoint@admin.local'
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
```

---

## Step 2: Environment Variables

Set these in Vercel (Project → Settings → Environment Variables):

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | From Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Anon key from Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Service role key — **keep secret!** |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Used for WhatsApp receipt share links |

> ⚠️ Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code.

---

## Step 3: Vercel Deployment

```bash
# Clone or upload the project to GitHub
# Then in Vercel:
# 1. Import the GitHub repo
# 2. Framework: Next.js (auto-detected)
# 3. Root Directory: 1_webapp/emi-portal-nextjs
# 4. Add all env vars from Step 2
# 5. Deploy
```

Or via Vercel CLI:
```bash
cd 1_webapp/emi-portal-nextjs
npx vercel --prod
```

---

## Step 4: Create Retailers (Admin)

1. Login at `/login` with admin credentials
2. Go to **🏪 Retailers** tab
3. Click **+ Add Retailer**
4. Fill: Name, Username, Password, Retail PIN (4-6 digits), Mobile (optional)
5. The retailer login email will be: `username@retailer.local`

---

## Step 5: Customer CSV Import (Admin)

1. Login as admin
2. Go to **📥 Import CSV** tab
3. Prepare a CSV with headers:
   ```
   customer_name,mobile,imei,purchase_value,purchase_date,emi_amount,emi_tenure,emi_due_day,retailer_username,father_name,aadhaar,address,model_no,box_no,down_payment,first_emi_charge_amount
   ```
4. `purchase_date` format: `YYYY-MM-DD`
5. `retailer_username` must match an existing retailer's username
6. Duplicate IMEIs are skipped automatically

---

## Pages & Flows

| URL | Who | Description |
|-----|-----|-------------|
| `/` | All | Landing page / redirect |
| `/login` | Staff | Supabase Auth login for admin & retailer |
| `/admin` | Admin | Full dashboard: search, retailers, reports, CSV import |
| `/admin/approvals` | Admin | Approve/reject retailer payment requests |
| `/retailer` | Retailer | Customer search + payment submission |
| `/customer` | Customer | Self-service EMI view (Aadhaar OR mobile login) |
| `/receipt/[id]` | All | Payment receipt (view + print) |
| `/api/receipt/[id]` | All | Download receipt as HTML file (works on mobile) |

---

## Key Features Implemented

### ✅ Bug Fixes
- **Receipt download**: `/api/receipt/[id]` returns HTML with `Content-Disposition: attachment` — works on all devices including mobile
- Receipt page has Download + Print + WhatsApp share buttons

### ✅ Customer Login
- Supports **Aadhaar OR Mobile** (not both required)
- If mobile matches multiple customers: clear error shown, user asked to use Aadhaar
- Session persisted in `localStorage` until logout

### ✅ Retailer Mobile Number
- Added `mobile` field to retailers table
- Shown in: retailer management table, payment receipts, receipt download

### ✅ Upcoming EMI Alerts
- **Retailer dashboard**: "Show Upcoming EMIs (Next 5 Days)" button shows a table
- **Customer portal**: Popup banner if next EMI due within 5 days, showing amount breakdown

### ✅ CSV Import
- Admin-only tab with file upload
- Parses CSV client-side, sends to `/api/csv-import`
- Returns inserted/skipped/failed summary with reasons

### ✅ Collection Logic
- Retailer submits → status: PENDING, requires admin approval
- Admin records directly → status: APPROVED immediately
- Atomic approval via `approve_payment_request` RPC

### ✅ Customer Form Validation
- All required fields validated on frontend with error highlighting
- Image URL fields are optional
- IMEI must be exactly 15 digits (enforced at DB level too)

---

## RLS Summary

| Table | Admin | Retailer | Public |
|-------|-------|----------|--------|
| profiles | All | Own row | — |
| retailers | All | Own row (read) | — |
| customers | All | Own retailer's (read) | — |
| emi_schedule | All | Own customers' (read) | — |
| payment_requests | All | Own retailer's (read/insert) | — |
| audit_log | Read | — | — |
| fine_settings | All | Read | — |

All DB writes via API routes use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS safely).

---

## Troubleshooting

**"retailers not showing"**: Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel env vars.

**Build fails**: Run `npm run build` locally. Check for TypeScript errors.

**Customer can't login**: Verify Aadhaar (12 digits) and mobile (10 digits) match exactly what's in the DB.

**Receipt download shows 404**: Payment ID must exist in `payment_requests` table.
