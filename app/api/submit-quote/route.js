import { NextResponse } from 'next/server';

const ZAPIER_WEBHOOK = 'https://hooks.zapier.com/hooks/catch/25599721/u7puvj4/';
const ORDERSTATUS_ID = '256246';

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      fname, lname, email, phone, company,
      dueDate, notes, printLocations, jobName,
      lineItems, artworkUrls = [],
    } = body;

    const resolvedJobName = jobName || `${fname} ${lname}`.trim();

    const formattedDueDate = dueDate
      ? (() => { const [y, m, d] = dueDate.split('-'); return `${m}/${d}/${y}`; })()
      : null;

    const notesComposed = [
      notes || null,
      artworkUrls.length > 0
        ? `Artwork files (${artworkUrls.length}):\n${artworkUrls.map((f) => `- ${f.name}: ${f.url}`).join('\n')}`
        : 'No artwork provided',
    ].filter(Boolean).join('\n\n');

    const payload = {
      customer: { first_name: fname, last_name: lname, email, phone, company },
      order: {
        order_nickname:              resolvedJobName,
        formatted_customer_due_date: formattedDueDate,
        orderstatus_id:              ORDERSTATUS_ID,
        notes:                       notesComposed,
        production_notes:            printLocations || null,
      },
      line_items: lineItems,
      artwork_urls: artworkUrls,
    };

    await fetch(ZAPIER_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error submitting quote:', error);
    return NextResponse.json({ error: 'Failed to submit quote: ' + error.message }, { status: 500 });
  }
}
