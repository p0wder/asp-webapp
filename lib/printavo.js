/**
 * Printavo GraphQL API client for Next.js server-side use.
 * Reads credentials from environment variables.
 *
 * Confirmed working API shape (from introspection + live tests):
 *
 * quoteCreate(input: QuoteCreateInput!) → Quote
 *   - contact: IDInput! (existing contact id)
 *   - customerDueAt: ISO8601Date! (YYYY-MM-DD)
 *   - dueAt: ISO8601DateTime! (full ISO string)
 *   - nickname, customerNote, productionNote: String
 *
 * lineItemGroupCreate(parentId: ID!, input: LineItemGroupCreateInput!) → LineItemGroup
 *   - position: Int!
 *
 * lineItemCreate(lineItemGroupId: ID!, input: LineItemCreateInput!) → LineItem
 *   - position: Int!, description, price: Float
 *   - category: IDInput (category id for decoration type)
 *   - sizes: [LineItemSizeCountInput] for quantity (size: "size_other", count: qty)
 *
 * lineItemMockupCreate(lineItemId: ID!, publicImageUrl: String!) → Mockup
 *   - attaches a mockup image directly to a line item
 *
 * imprintCreate(lineItemGroupId: ID!, input: ImprintCreateInput!) → Imprint
 *   - details: String
 *
 * statusUpdate(parentId: ID!, statusId: ID!) → OrderUnion
 *
 * contacts(query: String) → search by email/name
 *   - returns contact.customer { id } for the associated customer
 *
 * customerCreate(input: CustomerCreateInput!) → Customer
 *   - companyName: String
 *   - primaryContact: ContactInput! (firstName, lastName, email: [String!], phone)
 *   - returns { id, companyName, primaryContact { id } }
 */

const API_URL = 'https://www.printavo.com/api/v2';

export async function gql(query, variables = {}) {
  const token = process.env.PRINTAVO_API_TOKEN;
  const email = process.env.PRINTAVO_EMAIL;

  if (!token || !email) {
    throw new Error('PRINTAVO_API_TOKEN and PRINTAVO_EMAIL env vars are required');
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      email,
      token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Printavo HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

// ─── Customer / Contact lookup & creation ────────────────────────────────────

/**
 * Find an existing contact by email. Returns the first match or null.
 * The returned contact includes customer { id } for the associated customer.
 */
export async function findContactByEmail(emailAddress) {
  const data = await gql(
    `query FindContact($query: String) {
      contacts(first: 10, query: $query) {
        nodes {
          id
          fullName
          email
          customer { id companyName }
        }
      }
    }`,
    { query: emailAddress }
  );
  // The Printavo contacts search is fuzzy — filter to exact email match
  const lower = emailAddress.toLowerCase();
  const exact = data.contacts.nodes.find(
    (c) => c.email && c.email.toLowerCase() === lower
  );
  return exact || null;
}

/**
 * Create a new customer with a primary contact.
 * Returns { id, companyName, primaryContact: { id } }
 *
 * CustomerCreateInput:
 *   - companyName: String
 *   - primaryContact: ContactInput! { firstName, lastName, email: [String!], phone }
 */
export async function createCustomer({ firstName, lastName, email, phone, companyName, address }) {
  const input = {
    companyName: companyName || `${firstName} ${lastName}`.trim(),
    primaryContact: {
      firstName,
      lastName: lastName || '',
      email: [email],
      phone: phone || null,
    },
  };

  // Add billing address if provided
  // AddressInput fields: address1, address2, city, stateIso, zipCode, countryIso
  if (address && (address.address1 || address.city || address.zip)) {
    input.billingAddress = {
      address1: address.address1 || null,
      address2: address.address2 || null,
      city: address.city || null,
      stateIso: address.state || null,
      zipCode: address.zip || null,
      countryIso: 'US',
    };
  }

  const data = await gql(
    `mutation CreateCustomer($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        id
        companyName
        primaryContact {
          id
          fullName
          email
        }
      }
    }`,
    { input }
  );
  return data.customerCreate;
}

// ─── Quote creation ──────────────────────────────────────────────────────────

/**
 * Create a quote in Printavo.
 * contact must be an existing contact ID (IDInput).
 * customerDueAt: YYYY-MM-DD string (or null → defaults to today)
 */
export async function createQuote({ contactId, nickname, customerDueAt, customerNote, productionNote, billingAddress, shippingAddress }) {
  const today = new Date().toISOString().split('T')[0];
  const nowISO = new Date().toISOString();

  const input = {
    contact: { id: contactId },
    customerDueAt: customerDueAt || today,
    dueAt: nowISO,
    nickname: nickname || null,
    customerNote: customerNote || null,
    productionNote: productionNote || null,
  };

  // CustomerAddressInput: companyName, customerName, address1, address2, city, stateIso, zipCode, countryIso
  if (billingAddress) {
    input.billingAddress = billingAddress;
  }
  if (shippingAddress) {
    input.shippingAddress = shippingAddress;
  }

  const data = await gql(
    `mutation CreateQuote($input: QuoteCreateInput!) {
      quoteCreate(input: $input) {
        id
        visualId
        nickname
        publicUrl
      }
    }`,
    { input }
  );

  return data.quoteCreate;
}

/**
 * Set the status on a quote using statusUpdate.
 */
export async function setQuoteStatus(quoteId, statusId) {
  const data = await gql(
    `mutation SetStatus($parentId: ID!, $statusId: ID!) {
      statusUpdate(parentId: $parentId, statusId: $statusId) {
        ... on Quote { id visualId status { id name } }
      }
    }`,
    { parentId: quoteId, statusId }
  );
  return data.statusUpdate;
}

// ─── Line items ──────────────────────────────────────────────────────────────

/**
 * Create a line item group within a quote.
 * parentId = quote ID, position = 1-based integer
 */
export async function createLineItemGroup(quoteId, position = 1) {
  const data = await gql(
    `mutation CreateGroup($parentId: ID!, $input: LineItemGroupCreateInput!) {
      lineItemGroupCreate(parentId: $parentId, input: $input) {
        id position
      }
    }`,
    { parentId: quoteId, input: { position } }
  );
  return data.lineItemGroupCreate;
}

/**
 * Create a line item within a line item group.
 * - categoryId: IDInput for the decoration category (e.g. Screen Printing)
 * - quantity: sets via sizes array using size_other
 * - price: Float (unit price)
 * - description: garment type name
 */
export async function createLineItem({ lineItemGroupId, description, quantity, price, categoryId, position = 1 }) {
  const input = {
    position,
    description: description || null,
    price: price != null ? parseFloat(price) : null,
  };

  if (categoryId) {
    input.category = { id: categoryId };
  }

  if (quantity && quantity > 0) {
    input.sizes = [{ size: 'size_other', count: parseInt(quantity) }];
  }

  const data = await gql(
    `mutation CreateLineItem($lineItemGroupId: ID!, $input: LineItemCreateInput!) {
      lineItemCreate(lineItemGroupId: $lineItemGroupId, input: $input) {
        id description price items
      }
    }`,
    { lineItemGroupId, input }
  );
  return data.lineItemCreate;
}

/**
 * Attach a mockup image URL directly to a line item.
 * lineItemMockupCreate(lineItemId: ID!, publicImageUrl: String!) → Mockup
 */
export async function createLineItemMockup(lineItemId, publicImageUrl) {
  const data = await gql(
    `mutation CreateLineItemMockup($lineItemId: ID!, $publicImageUrl: String!) {
      lineItemMockupCreate(lineItemId: $lineItemId, publicImageUrl: $publicImageUrl) {
        id fullImageUrl
      }
    }`,
    { lineItemId, publicImageUrl }
  );
  return data.lineItemMockupCreate;
}

// ─── Imprints ────────────────────────────────────────────────────────────────

/**
 * Create an imprint (print location) on a line item group.
 */
export async function createImprint({ lineItemGroupId, details }) {
  const data = await gql(
    `mutation CreateImprint($lineItemGroupId: ID!, $input: ImprintCreateInput!) {
      imprintCreate(lineItemGroupId: $lineItemGroupId, input: $input) {
        id details
      }
    }`,
    {
      lineItemGroupId,
      input: { details: details || null },
    }
  );
  return data.imprintCreate;
}

/**
 * Attach a mockup image URL to an imprint (kept for backward compat).
 */
export async function createImprintMockup(imprintId, publicImageUrl) {
  const data = await gql(
    `mutation CreateImprintMockup($imprintId: ID!, $publicImageUrl: String!) {
      imprintMockupCreate(imprintId: $imprintId, publicImageUrl: $publicImageUrl) {
        id fullImageUrl
      }
    }`,
    { imprintId, publicImageUrl }
  );
  return data.imprintMockupCreate;
}
