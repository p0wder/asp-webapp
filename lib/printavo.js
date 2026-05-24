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

// ─── Invoice status transitions ──────────────────────────────────────────────
//
// Spec 002-printavo-order-notification. Two known invoice statuses we care
// about; flipping `DRY_RUN_INVOICE_STATUS_UPDATE` to `true` short-circuits
// the mutation to a no-op log line, satisfying Principle VI's "safe default"
// requirement by making the live behaviour a reviewable in-code flag.

export const READY_TO_ORDER_STATUS_ID    = '256605'; // Ready to Order
export const GOODS_IN_TRANSIT_STATUS_ID  = '292756'; // Goods In Transit
export const ART_APPROVED_STATUS_ID      = '256250'; // Art Approved (proof accepted by customer)
export const DESIGN_NEEDED_STATUS_ID     = '433068'; // Design Needed (proof changes requested)

// Hardcoded allow-list. `setInvoiceStatus` refuses any transition not present
// here so a typo (or future addition of a different target status) cannot
// accidentally move an invoice somewhere unexpected.
const ALLOWED_INVOICE_STATUS_TRANSITIONS = new Set([
  `${READY_TO_ORDER_STATUS_ID}->${GOODS_IN_TRANSIT_STATUS_ID}`,
]);

// Set to `true` to short-circuit setInvoiceStatus to a logging no-op without
// hitting Printavo. Flipping this is a deliberate in-code edit per
// Constitution Principle VI (the same pattern as `testOrder: true` in
// lib/ssActivewear.js).
export const DRY_RUN_INVOICE_STATUS_UPDATE = false;

/**
 * Set the status on an invoice using statusUpdate. Same mutation as
 * setQuoteStatus but with an Invoice fragment in the selection set —
 * Printavo's statusUpdate returns an OrderUnion that includes Invoice.
 *
 * Enforces an allow-list keyed by (currentExpected, target). Today the only
 * allowed target is GOODS_IN_TRANSIT_STATUS_ID from READY_TO_ORDER_STATUS_ID.
 *
 * Throws on a disallowed target. The caller is responsible for fetching the
 * current status (or accepting the FR-006 race window) before calling.
 *
 * @param {string} invoiceId — Printavo invoice node ID
 * @param {string} targetStatusId — must be in the allow-list
 * @returns {Promise<{ id: string, visualId: string, status: { id: string, name: string }, dryRun?: boolean }>}
 */
export async function setInvoiceStatus(invoiceId, targetStatusId) {
  const transition = `${READY_TO_ORDER_STATUS_ID}->${targetStatusId}`;
  if (!ALLOWED_INVOICE_STATUS_TRANSITIONS.has(transition)) {
    throw new Error(
      `setInvoiceStatus: transition not in allow-list: ${transition}. ` +
        `Add it to ALLOWED_INVOICE_STATUS_TRANSITIONS in lib/printavo.js if intended.`,
    );
  }

  if (DRY_RUN_INVOICE_STATUS_UPDATE) {
    console.log(
      `[setInvoiceStatus] DRY_RUN — would set invoice ${invoiceId} → status ${targetStatusId}`,
    );
    return { id: invoiceId, visualId: null, status: { id: targetStatusId, name: '(dry-run)' }, dryRun: true };
  }

  console.log(`[setInvoiceStatus] ▶ invoice=${invoiceId} target=${targetStatusId}`);
  const data = await gql(
    `mutation SetInvoiceStatus($parentId: ID!, $statusId: ID!) {
      statusUpdate(parentId: $parentId, statusId: $statusId) {
        ... on Invoice { id visualId status { id name } }
        ... on Quote   { id visualId status { id name } }
      }
    }`,
    { parentId: invoiceId, statusId: targetStatusId },
  );
  console.log(`[setInvoiceStatus] ◀ result:`, JSON.stringify(data.statusUpdate));
  return data.statusUpdate;
}

/**
 * Batch fetch invoice details by ID, used by /api/place-order to classify
 * the source invoices from a checkout submission. Returns one object per
 * requested ID; missing IDs simply do not appear in the result.
 *
 * @param {string[]} invoiceIds — Printavo invoice node IDs
 * @returns {Promise<Array<{ id: string, visualId: string, status: { id: string, name: string }, lineItems: Array<{ id: string, itemNumber: string, color: string, sizes: Array<{ size: string, count: number }> }> }>>}
 */
export async function getInvoicesByIds(invoiceIds) {
  if (!invoiceIds?.length) return [];
  const data = await gql(
    `query InvoicesByIds($ids: [ID!]!) {
      invoices(first: 50, ids: $ids) {
        nodes {
          id
          visualId
          status { id name }
          lineItemGroups {
            nodes {
              lineItems {
                nodes {
                  id
                  itemNumber
                  color
                  description
                  items
                  sizes { size count }
                }
              }
            }
          }
        }
      }
    }`,
    { ids: invoiceIds },
  );
  // Flatten lineItemGroups → lineItems[] per invoice.
  return (data.invoices?.nodes || []).map((inv) => ({
    id: inv.id,
    visualId: inv.visualId,
    status: inv.status,
    lineItems: (inv.lineItemGroups?.nodes || []).flatMap((g) => g.lineItems?.nodes || []),
  }));
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
 * Search the Printavo product catalog via GraphQL.
 * products(query: String!, first: Int) → [Product]
 * Returns an array of product nodes: [{ id, itemNumber, color, brand, description }]
 */
export async function searchProducts(query, first = 25) {
  const data = await gql(
    `query SearchProducts($query: String!, $first: Int) {
      products(query: $query, first: $first) {
        totalAmount
        nodes { id itemNumber color brand description }
      }
    }`,
    { query, first }
  );
  const nodes = data.products?.nodes || [];
  nodes.totalAmount = data.products?.totalAmount ?? 0;
  return nodes;
}

/**
 * Search the Printavo product catalog and return the first matching product ID.
 * Uses the products(query: String!) query which searches by item number, color, brand, etc.
 * Returns null if no match found.
 */
export async function findProductId(itemNumber, color) {
  if (!itemNumber) return null;
  const query = color ? `${itemNumber} ${color}` : itemNumber;
  try {
    const data = await gql(
      `query FindProduct($query: String!, $first: Int) {
        products(query: $query, first: $first) {
          nodes { id itemNumber color brand description }
        }
      }`,
      { query, first: 5 }
    );
    const nodes = data.products?.nodes || [];
    if (nodes.length === 0) return null;

    // Prefer exact itemNumber + color match
    const colorLower = (color || '').toLowerCase();
    const exact = nodes.find(
      (n) =>
        n.itemNumber === itemNumber &&
        (colorLower ? n.color?.toLowerCase() === colorLower : true)
    );
    // Fall back to first result with matching itemNumber
    const fallback = nodes.find((n) => n.itemNumber === itemNumber);
    return (exact || fallback || nodes[0])?.id || null;
  } catch {
    return null;
  }
}

/**
 * Create a line item within a line item group.
 * - categoryId: IDInput for the decoration category (e.g. Screen Printing)
 * - quantity: sets via sizes array using size_other
 * - price: Float (unit price)
 * - description: garment type name
 * - productId: optional Printavo product catalog ID (links to S&S Activewear for pricing)
 */
export async function createLineItem({ lineItemGroupId, description, quantity, price, categoryId, itemNumber, color, productId, markupPercentage, position = 1 }) {
  const input = {
    position,
    description: description || null,
    price: price != null ? parseFloat(price) : null,
  };

  if (categoryId) {
    input.category = { id: categoryId };
  }

  // itemNumber maps to the "Item #" column in Printavo (e.g. "5000" for Gildan 5000)
  if (itemNumber) {
    input.itemNumber = itemNumber;
  }

  // color maps to the "Color" column in Printavo (e.g. "Black", "White")
  if (color) {
    input.color = color;
  }

  // Link to the Printavo product catalog (enables S&S Activewear price lookup in UI)
  if (productId) {
    input.product = { id: productId };
  }

  // markupPercentage: Printavo uses this as the markup % on top of product cost
  // e.g. markupPercentage: 15 = 115% total (100% base + 15% markup)
  if (markupPercentage != null) {
    input.markupPercentage = parseFloat(markupPercentage);
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
 *
 * ImprintCreateInput fields:
 *   - details: String (description text)
 *   - typeOfWork: IDInput (type of work ID, e.g. Screen Printing = "11802")
 *   - pricingMatrixColumn: IDInput (pricing matrix column ID)
 *
 * Known typeOfWork IDs for aspmerch account:
 *   - Screen Printing: "11802"
 *   - Embroidery: "11803"
 *   - DTF: "14172"
 *
 * Known pricingMatrixColumn IDs for "Screen Printing 2026" matrix (id: 112229):
 *   - 1 color: "31382632"
 *   - 2 color: "31382633"
 *   - 3 color: "31382634"
 *   - 4 color: "31382635"
 *   - 5 color: "31382636"
 *   - 6 color: "31382637"
 */
export async function createImprint({ lineItemGroupId, details, typeOfWorkId, pricingMatrixColumnId }) {
  const input = { details: details || null };

  if (typeOfWorkId) {
    input.typeOfWork = { id: typeOfWorkId };
  }
  if (pricingMatrixColumnId) {
    input.pricingMatrixColumn = { id: pricingMatrixColumnId };
  }

  const data = await gql(
    `mutation CreateImprint($lineItemGroupId: ID!, $input: ImprintCreateInput!) {
      imprintCreate(lineItemGroupId: $lineItemGroupId, input: $input) {
        id details typeOfWork { id name } pricingMatrixColumn { id columnName }
      }
    }`,
    { lineItemGroupId, input }
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

/**
 * Query lineItemGroupPricing to get the S&S Activewear item price + signed receipt.
 * Returns an array of LineItemPriceReceipt objects: [{ price, description, signature, defaultMarkupPercentage }]
 *
 * lineItemGroupInput: { imprints: [ImprintInput], lineItems: [LineItemPricingInput] }
 *
 * ImprintInput: { details, typeOfWork: IDInput, pricingMatrixColumn: IDInput }
 * LineItemPricingInput: { position, product: IDInput, sizes: [LineItemSizeCountInput],
 *   category: IDInput, itemNumber, color, markupPercentage, price }
 *
 * NOTE: sizes must use enum values (size_other not "size_other") — pass as raw enum in GQL.
 */
export async function getLineItemGroupPricing({ imprints, lineItems }) {
  // Build the imprints part of the query
  const imprintArgs = imprints.map((imp) => {
    const parts = [`details: ${JSON.stringify(imp.details || '')}`];
    if (imp.typeOfWork?.id) parts.push(`typeOfWork: { id: ${JSON.stringify(imp.typeOfWork.id)} }`);
    if (imp.pricingMatrixColumn?.id) parts.push(`pricingMatrixColumn: { id: ${JSON.stringify(imp.pricingMatrixColumn.id)} }`);
    return `{ ${parts.join(', ')} }`;
  }).join(', ');

  // Build the lineItems part of the query
  const lineItemArgs = lineItems.map((li) => {
    const parts = [`position: ${li.position || 1}`];
    if (li.product?.id) parts.push(`product: { id: ${JSON.stringify(li.product.id)} }`);
    if (li.sizes?.length) {
      const sizeParts = li.sizes.map((s) => `{ size: ${s.size}, count: ${s.count} }`).join(', ');
      parts.push(`sizes: [${sizeParts}]`);
    }
    if (li.category?.id) parts.push(`category: { id: ${JSON.stringify(li.category.id)} }`);
    if (li.itemNumber) parts.push(`itemNumber: ${JSON.stringify(li.itemNumber)}`);
    if (li.color) parts.push(`color: ${JSON.stringify(li.color)}`);
    if (li.markupPercentage != null) parts.push(`markupPercentage: ${li.markupPercentage}`);
    if (li.price != null) parts.push(`price: ${li.price}`);
    return `{ ${parts.join(', ')} }`;
  }).join(', ');

  const query = `{
    lineItemGroupPricing(lineItemGroup: {
      imprints: [${imprintArgs}],
      lineItems: [${lineItemArgs}]
    }) {
      price description signature defaultMarkupPercentage
    }
  }`;

  const data = await gql(query, {});
  return data.lineItemGroupPricing;
}

/**
 * Calculate the total price for a product given a quantity, imprint details, and optional markup.
 *
 * This combines searchProducts (to find the product ID) + lineItemGroupPricing (to get the price).
 *
 * @param {object} opts
 * @param {string} opts.itemNumber - e.g. "5000"
 * @param {string} opts.color - e.g. "Black"
 * @param {number} opts.quantity - total quantity
 * @param {string} [opts.typeOfWorkId] - decoration type ID (e.g. "11802" for Screen Printing)
 * @param {string} [opts.pricingMatrixColumnId] - pricing matrix column ID (e.g. "31382632" for 1 color)
 * @param {string} [opts.categoryId] - line item category ID
 * @param {number} [opts.markupPercentage] - markup % (e.g. 15 = 15% on top of cost)
 * @param {string} [opts.imprintDetails] - description for the imprint location
 *
 * @returns {{ unitPrice: number, totalPrice: number, description: string, productId: string|null, receipts: Array }}
 */
export async function calculateProductPrice({
  itemNumber,
  color,
  quantity,
  typeOfWorkId,
  pricingMatrixColumnId,
  categoryId,
  markupPercentage,
  imprintDetails = '',
}) {
  // Step 1: Find the product ID
  const productId = await findProductId(itemNumber, color);
  console.log(`[calculateProductPrice] itemNumber=${itemNumber} color=${color} qty=${quantity} productId=${productId}`);

  // Step 2: Build imprints array (at least one required for pricing)
  const imprints = [];
  if (typeOfWorkId || pricingMatrixColumnId) {
    const imp = { details: imprintDetails };
    if (typeOfWorkId) imp.typeOfWork = { id: typeOfWorkId };
    if (pricingMatrixColumnId) imp.pricingMatrixColumn = { id: pricingMatrixColumnId };
    imprints.push(imp);
  }

  // Step 3: Build line item for pricing
  const lineItem = {
    position: 1,
    sizes: [{ size: 'size_other', count: parseInt(quantity) }],
  };
  if (productId) lineItem.product = { id: productId };
  if (itemNumber) lineItem.itemNumber = itemNumber;
  if (color) lineItem.color = color;
  if (categoryId) lineItem.category = { id: categoryId };
  if (markupPercentage != null) lineItem.markupPercentage = parseFloat(markupPercentage);

  // Step 4: Get pricing from Printavo
  let receipts = [];
  let unitPrice = null;
  try {
    receipts = await getLineItemGroupPricing({ imprints, lineItems: [lineItem] });
    // receipts is an array — first entry is the garment line item price
    unitPrice = receipts?.[0]?.price ?? null;
    console.log(`[calculateProductPrice] receipts=`, JSON.stringify(receipts));
  } catch (err) {
    console.error(`[calculateProductPrice] lineItemGroupPricing error:`, err.message);
  }

  const totalPrice = unitPrice != null ? unitPrice * parseInt(quantity) : null;

  return {
    productId,
    unitPrice,
    totalPrice,
    quantity: parseInt(quantity),
    receipts,
  };
}

/**
 * Fetch all open quotes from Printavo for the admin pipeline dashboard.
 * Returns quotes across all non-closed statuses, sorted by creation date descending.
 *
 * @returns {Promise<Array<{ id, visualId, nickname, publicUrl, total, createdAt, customerDueAt, status: { id, name, color }, contact: { id, fullName, email } }>>}
 */
export async function getOpenQuotes() {
  const data = await gql(
    `query GetOpenQuotes {
      quotes(first: 100) {
        nodes {
          id
          visualId
          nickname
          publicUrl
          total
          createdAt
          customerDueAt
          status { id name color }
          contact {
            id
            fullName
            email
          }
        }
        totalNodes
      }
    }`,
  );
  return data.quotes?.nodes || [];
}

/**
 * Fetch a single Printavo quote or invoice by its node ID.
 * Used by the order status and proof APIs to look up invoice details.
 *
 * @param {string} id — Printavo node ID
 * @returns {Promise<{ id, visualId, nickname, total, customerDueAt, status: { id, name }, contact: { id, fullName, email } }|null>}
 */
export async function getInvoiceById(id) {
  if (!id) return null;
  const data = await gql(
    `query GetInvoice($id: ID!) {
      invoice(id: $id) {
        id
        visualId
        nickname
        total
        customerDueAt
        createdAt
        status { id name color }
        contact {
          id
          fullName
          email
        }
      }
    }`,
    { id },
  );
  return data.invoice || null;
}

/**
 * Fetch all quotes/invoices for a customer email address.
 * Used by the customer dashboard (/my-orders) to list a customer's order history.
 *
 * @param {string} email
 * @returns {Promise<Array>}
 */
export async function getInvoicesByCustomerEmail(email) {
  if (!email) return [];
  const data = await gql(
    `query QuotesByEmail($query: String) {
      quotes(first: 100, query: $query) {
        nodes {
          id
          visualId
          nickname
          total
          createdAt
          customerDueAt
          status { id name color }
          contact { id fullName email }
        }
      }
    }`,
    { query: email },
  );
  const lower = email.toLowerCase();
  const nodes = data.quotes?.nodes || [];
  return nodes.filter((q) => q.contact?.email?.toLowerCase() === lower);
}

/**
 * Update a line item's price using a priceReceiptSignature from lineItemGroupPricing.
 * This sets the signed price receipt on the line item so Printavo shows the
 * correct item cost breakdown (S&S product cost + markup + print cost).
 */
export async function updateLineItemPrice(lineItemId, priceReceiptSignature) {
  const data = await gql(
    `mutation UpdateLineItemPrice($id: ID!, $input: LineItemInput!) {
      lineItemUpdate(id: $id, input: $input) {
        id price priceReceipt { price description }
      }
    }`,
    { id: lineItemId, input: { position: 1, priceReceiptSignature } }
  );
  return data.lineItemUpdate;
}
