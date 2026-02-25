import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const serviceClient = createServiceClient();

  const { data: request, error } = await serviceClient
    .from('payment_requests')
    .select(`
      *,
      customer:customers(
        customer_name, father_name, imei, mobile, model_no, aadhaar,
        first_emi_charge_amount,
        retailer:retailers(name, mobile)
      ),
      retailer:retailers(name, username, mobile),
      items:payment_request_items(emi_no, amount)
    `)
    .eq('id', params.id)
    .single();

  if (error || !request) {
    return new NextResponse('Receipt not found', { status: 404 });
  }

  const customer = request.customer as {
    customer_name?: string;
    father_name?: string;
    imei?: string;
    mobile?: string;
    model_no?: string;
    aadhaar?: string;
    first_emi_charge_amount?: number;
    retailer?: { name?: string; mobile?: string };
  } | null;

  const retailer = request.retailer as {
    name?: string;
    username?: string;
    mobile?: string;
  } | null;

  const items = (request.items as { emi_no: number; amount: number }[]) ?? [];

  const statusColors: Record<string, string> = {
    PENDING: '#92400e',
    APPROVED: '#1d4ed8',
    REJECTED: '#991b1b',
  };

  const statusBgs: Record<string, string> = {
    PENDING: '#fef3c7',
    APPROVED: '#dbeafe',
    REJECTED: '#fee2e2',
  };

  const statusLabels: Record<string, string> = {
    PENDING: '⏳ Pending Approval',
    APPROVED: '✅ Approved',
    REJECTED: '❌ Rejected',
  };

  const status = request.status as string;
  const statusColor = statusColors[status] ?? '#374151';
  const statusBg = statusBgs[status] ?? '#f9fafb';
  const statusLabel = statusLabels[status] ?? status;

  const emiAmount = Number(request.total_emi_amount ?? 0);
  const fineAmount = Number(request.fine_amount ?? 0);
  const firstEmiCharge = Number(request.first_emi_charge_amount ?? 0);
  const totalAmount = Number(request.total_amount ?? 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EMI Receipt – ${params.id.slice(0, 8).toUpperCase()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f8fafc;
      padding: 2rem 1rem;
      color: #1e293b;
    }
    .receipt {
      max-width: 480px;
      margin: 0 auto;
      background: white;
      border-radius: 1.5rem;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.12);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%);
      padding: 2rem;
      text-align: center;
      color: white;
    }
    .header h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; }
    .header p { font-size: 0.75rem; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.25rem; }
    .status-bar {
      padding: 0.75rem 1.5rem;
      background: ${statusBg};
      border-bottom: 2px solid ${statusColor}40;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .status-label { font-weight: 700; font-size: 0.85rem; color: ${statusColor}; }
    .receipt-id { font-family: monospace; font-size: 0.7rem; color: ${statusColor}; }
    .body { padding: 1.5rem; }
    .section { margin-bottom: 1.5rem; }
    .section-title {
      font-size: 0.65rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 0.75rem;
    }
    .kv {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }
    .kv-label { font-size: 0.8rem; color: #64748b; flex-shrink: 0; }
    .kv-value {
      font-size: 0.875rem;
      font-weight: 500;
      text-align: right;
      word-break: break-all;
      color: #1e293b;
    }
    .kv-value.bold { font-weight: 700; }
    .kv-value.mono { font-family: monospace; font-size: 0.8rem; }
    .kv-value.small { font-size: 0.72rem; }
    .divider { height: 1px; background: #e2e8f0; margin: 0.75rem 0; }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .total-label { font-weight: 800; font-size: 1rem; color: #1e293b; }
    .total-value { font-family: monospace; font-weight: 800; font-size: 1.5rem; color: #ca8a04; }
    .footer {
      text-align: center;
      padding-top: 1rem;
      border-top: 1px dashed #e2e8f0;
    }
    .footer p { font-size: 0.7rem; color: #94a3b8; }
    .print-only { display: none; }
    @media print {
      body { background: white; padding: 0; }
      .receipt { box-shadow: none; border: none; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width:480px;margin:0 auto 1rem;display:flex;gap:0.75rem;justify-content:center;">
    <button onclick="window.print()" style="padding:0.625rem 1.25rem;background:#eab308;color:white;border:none;border-radius:0.75rem;font-size:0.875rem;font-weight:600;cursor:pointer;">
      🖨️ Print Receipt
    </button>
  </div>

  <div class="receipt">
    <!-- Header -->
    <div class="header">
      <h1>TelePoint</h1>
      <p>EMI Payment Receipt</p>
    </div>

    <!-- Status -->
    <div class="status-bar">
      <span class="status-label">${statusLabel}</span>
      <span class="receipt-id">#${params.id.slice(0, 8).toUpperCase()}</span>
    </div>

    <!-- Body -->
    <div class="body">

      <!-- Customer -->
      <div class="section">
        <div class="section-title">Customer</div>
        <div class="kv">
          <span class="kv-label">Name</span>
          <span class="kv-value bold">${customer?.customer_name ?? '—'}</span>
        </div>
        ${customer?.father_name ? `<div class="kv">
          <span class="kv-label">Father / C/O</span>
          <span class="kv-value">${customer.father_name}</span>
        </div>` : ''}
        <div class="kv">
          <span class="kv-label">Mobile</span>
          <span class="kv-value mono">${customer?.mobile ?? '—'}</span>
        </div>
        ${customer?.model_no ? `<div class="kv">
          <span class="kv-label">Device</span>
          <span class="kv-value">${customer.model_no}</span>
        </div>` : ''}
        <div class="kv">
          <span class="kv-label">IMEI</span>
          <span class="kv-value mono small">${customer?.imei ?? '—'}</span>
        </div>
      </div>

      <!-- Retailer -->
      <div class="section">
        <div class="section-title">Retailer</div>
        <div class="kv">
          <span class="kv-label">Name</span>
          <span class="kv-value bold">${retailer?.name ?? '—'}</span>
        </div>
        ${retailer?.mobile ? `<div class="kv">
          <span class="kv-label">Mobile</span>
          <span class="kv-value mono">${retailer.mobile}</span>
        </div>` : ''}
        ${retailer?.username ? `<div class="kv">
          <span class="kv-label">Retailer ID</span>
          <span class="kv-value mono small">@${retailer.username}</span>
        </div>` : ''}
      </div>

      <!-- Payment Breakdown -->
      <div class="section">
        <div class="section-title">Payment Breakdown</div>
        ${items.map(i => `<div class="kv">
          <span class="kv-label">EMI #${i.emi_no}</span>
          <span class="kv-value mono">${fmt(i.amount)}</span>
        </div>`).join('')}
        ${items.length === 0 && emiAmount > 0 ? `<div class="kv">
          <span class="kv-label">EMI Paid</span>
          <span class="kv-value mono">${fmt(emiAmount)}</span>
        </div>` : ''}
        ${firstEmiCharge > 0 ? `<div class="kv">
          <span class="kv-label">1st EMI Charge ⭐</span>
          <span class="kv-value mono" style="color:#92400e">${fmt(firstEmiCharge)}</span>
        </div>` : ''}
        ${fineAmount > 0 ? `<div class="kv">
          <span class="kv-label">Late Fine ⚠️</span>
          <span class="kv-value mono" style="color:#991b1b">${fmt(fineAmount)}</span>
        </div>` : ''}
        <div class="divider"></div>
        <div class="total-row">
          <span class="total-label">Total Paid</span>
          <span class="total-value">${fmt(totalAmount)}</span>
        </div>
      </div>

      <!-- Transaction Details -->
      <div class="section">
        <div class="section-title">Transaction Details</div>
        <div class="kv">
          <span class="kv-label">Payment Mode</span>
          <span class="kv-value bold" style="color:${request.mode === 'UPI' ? '#1d4ed8' : '#16a34a'}">${request.mode}</span>
        </div>
        <div class="kv">
          <span class="kv-label">Submitted On</span>
          <span class="kv-value mono small">${fmtDate(request.created_at)}</span>
        </div>
        ${request.approved_at ? `<div class="kv">
          <span class="kv-label">Approved On</span>
          <span class="kv-value mono small">${fmtDate(request.approved_at)}</span>
        </div>` : ''}
      </div>

      ${request.notes ? `<div class="section">
        <div class="section-title">Notes</div>
        <p style="font-size:0.875rem;color:#475569;line-height:1.6;">${request.notes}</p>
      </div>` : ''}

      ${request.rejection_reason ? `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:0.75rem;padding:0.75rem 1rem;margin-bottom:1rem;">
        <p style="font-size:0.7rem;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.25rem;">Rejection Reason</p>
        <p style="font-size:0.875rem;color:#991b1b;">${request.rejection_reason}</p>
      </div>` : ''}

      <!-- Footer -->
      <div class="footer">
        <p>TelePoint EMI Portal · Thank you for your payment</p>
        <p style="margin-top:0.25rem;font-family:monospace;font-size:0.65rem;color:#cbd5e1;">${new Date(request.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

    </div>
  </div>

</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="receipt-${params.id.slice(0, 8)}.html"`,
      'Cache-Control': 'no-store',
    },
  });
}
