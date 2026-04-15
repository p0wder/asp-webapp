import { NextResponse } from 'next/server';

const GQL_URL = 'https://www.printavo.com/api/v2';
const PRINTAVO_EMAIL = process.env.PRINTAVO_EMAIL;
const PRINTAVO_TOKEN = process.env.PRINTAVO_TOKEN;

// ─── GraphQL client ───────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'email': PRINTAVO_EMAIL,
      'token': PRINTAVO_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Printavo API error: ${res.status} ${await res.text()}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

// ─── Printavo operations ───────────────────────────────────────────────────────

async function findOrCreateContact({ firstName, lastName, email, phone, company }) {
  // Search contacts by email — return the contact ID (quotes link to contacts, not customers)
  const search = await gql(
    `query FindContact($query: String) {
      contacts(query: $query, first: 1) {
        nodes { id }
      }
    }`,
    { query: email }
  );

  const contact = search?.contacts?.nodes?.[0];
  if (contact?.id) return contact.id;

  // Create new customer with primary contact — get back the contact ID
  const created = await gql(
    `mutation CustomerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        id
        primaryContact { id }
      }
    }`,
    {
      input: {
        companyName: company || `${firstName} ${lastName}`.trim(),
        primaryContact: { firstName, lastName, email, phone },
      },
    }
  );

  return created.customerCreate.primaryContact.id;
}

async function createQuote({ contactId, nickname, customerDueAt, customerNote, productionNote }) {
  const data = await gql(
    `mutation QuoteCreate($input: QuoteCreateInput!) {
      quoteCreate(input: $input) {
        id
        visualId
        url
      }
    }`,
    {
      input: {
        contact: { id: contactId },
        nickname,
        dueAt: customerDueAt,
        customerDueAt,
        customerNote,
        productionNote,
      },
    }
  );

  return data.quoteCreate;
}


async function createLineItemGroup(orderId) {
  const data = await gql(
    `mutation LineItemGroupCreate($parentId: ID!, $input: LineItemGroupCreateInput!) {
      lineItemGroupCreate(parentId: $parentId, input: $input) {
        id
      }
    }`,
    { parentId: orderId, input: { position: 1 } }
  );

  return data.lineItemGroupCreate.id;
}

async function createLineItem(lineItemGroupId, { style_description, size_other, category_id, unit_cost, ink_colors }, position = 1) {
  const data = await gql(
    `mutation LineItemCreate($lineItemGroupId: ID!, $input: LineItemCreateInput!) {
      lineItemCreate(lineItemGroupId: $lineItemGroupId, input: $input) {
        id
      }
    }`,
    {
      lineItemGroupId,
      input: {
        description:  style_description,
        price:        parseFloat(unit_cost),
        color:        `${ink_colors} color${ink_colors > 1 ? 's' : ''}`,
        category:     { id: category_id },
        sizes:        [{ size: 'size_other', count: parseInt(size_other, 10) }],
        position,
      },
    }
  );

  return data.lineItemCreate.id;
}

async function attachMockupImage(lineItemId, file) {
  // TODO: upload file to hosting service (Vercel Blob, Filestack, etc.) to get a publicImageUrl
  // then call lineItemMockupCreate with the URL
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request) {
  if (!PRINTAVO_EMAIL || !PRINTAVO_TOKEN) {
    return NextResponse.json(
      { error: 'Printavo credentials are not configured. Set PRINTAVO_EMAIL and PRINTAVO_TOKEN in .env.local.' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();

    const fname          = formData.get('fname')          ?? '';
    const lname          = formData.get('lname')          ?? '';
    const email          = formData.get('email')          ?? '';
    const phone          = formData.get('phone')          ?? '';
    const company        = formData.get('company')        ?? '';
    const dueDate        = formData.get('dueDate')        ?? '';
    const notes          = formData.get('notes')          ?? '';
    const printLocations = formData.get('printLocations') ?? '';
    const jobName        = formData.get('jobName')        ?? '';
    const lineItems      = JSON.parse(formData.get('lineItems') ?? '[]');
    const files          = formData.getAll('files').filter((f) => f instanceof File && f.size > 0);

    // dueAt is required by Printavo — default to 30 days out if not provided
    const dueAt = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const artNote = files.length > 0
      ? `Artwork files (${files.length}): ${files.map((f) => f.name).join(', ')}`
      : 'No artwork provided';
    const customerNote = [notes || null, artNote].filter(Boolean).join('\n\n');

    console.log('QUOTE PAYLOAD:', JSON.stringify({
      customer: { firstName: fname, lastName: lname, email, phone, company },
      quote: {
        nickname: jobName || `${fname} ${lname}`.trim(),
        dueAt,
        customerNote,
        productionNote: printLocations || null,
      },
      lineItems,
      files: files.map(f => ({ name: f.name, size: f.size, type: f.type })),
    }, null, 2));

    // 1 — Find or create contact
    const contactId = await findOrCreateContact({
      firstName: fname,
      lastName:  lname,
      email,
      phone,
      company,
    });

    // 2 — Create quote
    const quote = await createQuote({
      contactId,
      nickname:       jobName || `${fname} ${lname}`.trim(),
      customerDueAt:  dueAt,
      customerNote,
      productionNote: printLocations || null,
    });

    const quoteId = quote.id;

    // 3 — Add line item group + line items
    const lineItemIds = [];
    if (lineItems.length > 0) {
      const groupId = await createLineItemGroup(quoteId);
      for (const [i, item] of lineItems.entries()) {
        const liId = await createLineItem(groupId, item, i + 1);
        lineItemIds.push(liId);
      }
    }

    // 4 — Attach mockup images to every line item
    const uploadResults = [];
    if (files.length > 0 && lineItemIds.length > 0) {
      for (const lineItemId of lineItemIds) {
        for (const file of files) {
          try {
            await attachMockupImage(lineItemId, file);
            uploadResults.push({ lineItemId, file: file.name, ok: true });
          } catch (uploadErr) {
            console.error(`Mockup upload failed for line item ${lineItemId}:`, uploadErr.message);
            uploadResults.push({ lineItemId, file: file.name, ok: false, error: uploadErr.message });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      quoteId,
      quoteUrl: quote.url ?? `https://www.printavo.com/print/invoices/${quoteId}`,
      filesAttached: uploadResults.filter((r) => r.ok).length,
      filesTotal: files.length,
    });

  } catch (error) {
    console.error('Error creating Printavo quote:', error);
    return NextResponse.json(
      { error: 'Failed to create quote: ' + error.message },
      { status: 500 }
    );
  }
}
