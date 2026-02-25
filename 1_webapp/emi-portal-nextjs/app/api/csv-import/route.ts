import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface CSVRow {
  customer_name?: string;
  father_name?: string;
  mobile?: string;
  aadhaar?: string;
  voter_id?: string;
  address?: string;
  landmark?: string;
  alternate_number_1?: string;
  alternate_number_2?: string;
  model_no?: string;
  imei?: string;
  box_no?: string;
  purchase_value?: string;
  down_payment?: string;
  disburse_amount?: string;
  purchase_date?: string;
  emi_due_day?: string;
  emi_amount?: string;
  emi_tenure?: string;
  first_emi_charge_amount?: string;
  retailer_username?: string;
  retailer_id?: string;
}

function validateRow(row: CSVRow, retailers: { id: string; username: string }[]): string | null {
  if (!row.customer_name?.trim()) return 'customer_name is required';
  if (!row.mobile || !/^\d{10}$/.test(row.mobile.replace(/\D/g, ''))) return 'mobile must be 10 digits';
  if (!row.imei || !/^\d{15}$/.test(row.imei.replace(/\D/g, ''))) return 'imei must be 15 digits';
  if (!row.purchase_value || isNaN(Number(row.purchase_value))) return 'purchase_value is required';
  if (!row.purchase_date) return 'purchase_date is required';
  if (!row.emi_amount || isNaN(Number(row.emi_amount))) return 'emi_amount is required';
  if (!row.emi_tenure || isNaN(Number(row.emi_tenure))) return 'emi_tenure is required';
  if (!row.emi_due_day || isNaN(Number(row.emi_due_day))) return 'emi_due_day is required';

  const retailerId = row.retailer_id || retailers.find(r => r.username === row.retailer_username)?.id;
  if (!retailerId) return `retailer not found (username: ${row.retailer_username}, id: ${row.retailer_id})`;

  return null;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const rows: CSVRow[] = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Load all retailers for lookup
  const { data: retailers } = await serviceClient.from('retailers').select('id, username');
  const retailerList = retailers || [];

  const inserted: string[] = [];
  const skipped: { row: number; imei: string; reason: string }[] = [];
  const failed: { row: number; imei: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const imei = (row.imei || '').replace(/\D/g, '');
    const rowNum = i + 2; // 1-based with header

    // Validate
    const validErr = validateRow(row, retailerList);
    if (validErr) {
      failed.push({ row: rowNum, imei, reason: validErr });
      continue;
    }

    const retailerId = row.retailer_id || retailerList.find(r => r.username === row.retailer_username)?.id;

    // Check IMEI uniqueness
    const { count } = await serviceClient
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('imei', imei);

    if (count && count > 0) {
      skipped.push({ row: rowNum, imei, reason: 'IMEI already exists — skipped' });
      continue;
    }

    const payload = {
      retailer_id: retailerId,
      customer_name: row.customer_name!.trim(),
      father_name: row.father_name?.trim() || null,
      mobile: row.mobile!.replace(/\D/g, ''),
      aadhaar: row.aadhaar?.replace(/\D/g, '') || null,
      voter_id: row.voter_id?.trim() || null,
      address: row.address?.trim() || null,
      landmark: row.landmark?.trim() || null,
      alternate_number_1: row.alternate_number_1?.replace(/\D/g, '') || null,
      alternate_number_2: row.alternate_number_2?.replace(/\D/g, '') || null,
      model_no: row.model_no?.trim() || null,
      imei,
      box_no: row.box_no?.trim() || null,
      purchase_value: Number(row.purchase_value),
      down_payment: Number(row.down_payment || 0),
      disburse_amount: row.disburse_amount ? Number(row.disburse_amount) : null,
      purchase_date: row.purchase_date,
      emi_due_day: Number(row.emi_due_day),
      emi_amount: Number(row.emi_amount),
      emi_tenure: Number(row.emi_tenure),
      first_emi_charge_amount: Number(row.first_emi_charge_amount || 0),
    };

    const { error: insErr } = await serviceClient.from('customers').insert(payload);
    if (insErr) {
      failed.push({ row: rowNum, imei, reason: insErr.message });
    } else {
      inserted.push(imei);
    }
  }

  return NextResponse.json({
    total: rows.length,
    inserted: inserted.length,
    skipped: skipped.length,
    failed: failed.length,
    inserted_imeis: inserted,
    skipped_list: skipped,
    failed_list: failed,
  });
}
