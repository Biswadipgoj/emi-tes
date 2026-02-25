import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { aadhaar, mobile } = body as { aadhaar?: string; mobile?: string };

  const cleanAadhaar = (aadhaar ?? '').replace(/\D/g, '');
  const cleanMobile = (mobile ?? '').replace(/\D/g, '');

  if (!cleanAadhaar && !cleanMobile) {
    return NextResponse.json({ error: 'Provide Aadhaar or mobile number to login' }, { status: 400 });
  }
  if (cleanAadhaar && cleanAadhaar.length !== 12) {
    return NextResponse.json({ error: 'Aadhaar must be exactly 12 digits' }, { status: 400 });
  }
  if (cleanMobile && cleanMobile.length !== 10) {
    return NextResponse.json({ error: 'Mobile must be exactly 10 digits' }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  let query = serviceClient
    .from('customers')
    .select(`
      id, customer_name, father_name, aadhaar, mobile,
      alternate_number_1, alternate_number_2,
      model_no, imei, purchase_value, down_payment, disburse_amount,
      purchase_date, emi_due_day, emi_amount, emi_tenure,
      first_emi_charge_amount, first_emi_charge_paid_at,
      customer_photo_url, status,
      retailer:retailers(name, mobile)
    `)
    .eq('status', 'RUNNING');

  if (cleanAadhaar) {
    query = query.eq('aadhaar', cleanAadhaar);
    if (cleanMobile) {
      query = query.eq('mobile', cleanMobile);
    }
  } else {
    query = query.eq('mobile', cleanMobile);
  }

  const { data: customers, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!customers || customers.length === 0) {
    return NextResponse.json(
      { error: 'No matching customer found. Check your Aadhaar or Mobile number.' },
      { status: 401 }
    );
  }

  if (!cleanAadhaar && customers.length > 1) {
    return NextResponse.json(
      { error: 'Multiple accounts found with this mobile. Please login with your Aadhaar number instead.' },
      { status: 409 }
    );
  }

  const customer = customers[0];

  const { data: emis } = await serviceClient
    .from('emi_schedule')
    .select('id, emi_no, due_date, amount, status, paid_at, mode, fine_amount, fine_waived')
    .eq('customer_id', customer.id)
    .order('emi_no');

  const { data: breakdown } = await serviceClient.rpc('get_due_breakdown', {
    p_customer_id: customer.id,
  });

  return NextResponse.json({
    customer,
    emis: emis || [],
    breakdown,
  });
}
