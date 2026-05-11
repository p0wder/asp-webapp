import { NextResponse } from 'next/server';
import {
  findContactByEmail,
  createCustomer,
  createQuote,
  setQuoteStatus,
  createLineItemGroup,
  createLineItem,
  createImprint,
  createLineItemMockup,
  findProductId,
  getLineItemGroupPricing,
  updateLineItemPrice,
} from '@/lib/printavo';
import { calcUnitCost } from '@/lib/pricing';

// Printavo status ID for "Quote"
const QUOTE_STATUS_ID = '256246';

// Printavo category ID for Screen Printing (from original code)
const SCREEN_PRINTING_CATEGORY_ID = '178403';

// Map ink color count to pricingMatrixColumn ID (Screen Printing 2026 matrix)
const SCREEN_PRINTING_COLUMN_IDS = {
  1: '31382632',
  2: '31382633',
  3: '31382634',
  4: '31382635',
  5: '31382636',
  6: '31382637',
};

// Map decorationMethod to typeOfWork ID
const TYPE_OF_WORK_IDS = {
  'Screen Printing': '11802',
  'Embroidery': '11803',
  'DTF': '14172',
};

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      fname,
      lname,
      email,
      phone,
      company,
      dueDate,
      notes,
      jobName,
      decorationMethod,
      inkColors,
      qty,
      garmentTypes = [],
      locations = [],
      locsEnabled = false,
      artworkUrls = [],
      shirtQuality = '5000',
      shirtColor = null,
      billingAddress = null,
      shippingAddress = null,
    } = body;

    // ── Build job nickname ──────────────────────────────────────────────────
    const resolvedJobName =
      jobName?.trim() ||
      [garmentTypes.join(' + '), fname].filter(Boolean).join(' — ') ||
      `${fname} ${lname}`.trim();

    // ── Build production note (decoration method + print locations) ──────────
    const locLines =
      locsEnabled && locations.length > 0
        ? locations
            .map((l) => `• ${l.name} — ${l.colors} color${l.colors > 1 ? 's' : ''}${l.art ? ` (${l.art})` : ''}`)
            .join('\n')
        : null;

    const productionNote =
      [
        decorationMethod ? `Decoration: ${decorationMethod}` : null,
        locLines ? `Print Locations:\n${locLines}` : null,
      ]
        .filter(Boolean)
        .join('\n\n') || null;

    // ── Build customer note (notes + artwork list) ───────────────────────────
    const artworkSection =
      artworkUrls.length > 0
        ? `Artwork (${artworkUrls.length} file${artworkUrls.length > 1 ? 's' : ''}):\n${artworkUrls
            .map((f) => `• ${f.name}: ${f.url}`)
            .join('\n')}`
        : null;

    const notesSection = notes
      ? `━━━ NOTES / SPECIAL REQUESTS ━━━\n${notes}`
      : null;

    const customerNote = [notesSection, artworkSection].filter(Boolean).join('\n\n') || null;

    // ── 1. Find existing contact by email, or create a new customer ──────────
    let contactId = null;

    try {
      const existing = await findContactByEmail(email);
      if (existing) {
        contactId = existing.id;
      }
    } catch {
      // Non-fatal — will fall through to create
    }

    if (!contactId) {
      const newCustomer = await createCustomer({
        firstName: fname,
        lastName: lname || '',
        email,
        phone: phone || null,
        companyName: company || null,
        address: billingAddress || null,
      });
      contactId = newCustomer.primaryContact.id;
    }

    // ── 2. Create the quote ──────────────────────────────────────────────────
    const toQuoteAddress = (addr) => addr ? {
      address1: addr.address1 || null,
      address2: addr.address2 || null,
      city: addr.city || null,
      stateIso: addr.state || null,
      zipCode: addr.zip || null,
      countryIso: 'US',
    } : null;

    const quote = await createQuote({
      contactId,
      nickname: resolvedJobName,
      customerDueAt: dueDate || null,
      customerNote: customerNote || null,
      productionNote,
      billingAddress: toQuoteAddress(billingAddress),
      shippingAddress: toQuoteAddress(shippingAddress),
    });

    const quoteId = quote.id;

    // ── 3. Set status to "Quote" ─────────────────────────────────────────────
    try {
      await setQuoteStatus(quoteId, QUOTE_STATUS_ID);
    } catch (err) {
      console.warn('Could not set quote status:', err.message);
    }

    // ── 4. Calculate unit cost from pricing matrix ───────────────────────────
    const parsedQty = parseInt(qty) || 1;
    const parsedInkColors = parseInt(inkColors) || 1;
    const unitCost = calcUnitCost(parsedQty, parsedInkColors, locsEnabled, locations);
    const resolvedUnitCost = unitCost != null ? parseFloat(unitCost.toFixed(2)) : 0;

    // ── 5. Create line item groups + line items (one group per garment type) ─
    const mockupUrls = artworkUrls.filter((f) => f.url).map((f) => f.url);
    const typeOfWorkId = TYPE_OF_WORK_IDS[decorationMethod] || null;

    for (let gi = 0; gi < garmentTypes.length; gi++) {
      const garmentType = garmentTypes[gi];
      const group = await createLineItemGroup(quoteId, gi + 1);

      // Look up the product in the Printavo catalog to link S&S Activewear pricing
      let productId = null;
      try {
        productId = await findProductId(shirtQuality || '5000', shirtColor || null);
      } catch {
        // Non-fatal
      }

      // Create the line item
      const lineItem = await createLineItem({
        lineItemGroupId: group.id,
        description: garmentType,
        quantity: parsedQty,
        price: resolvedUnitCost,
        categoryId: SCREEN_PRINTING_CATEGORY_ID,
        itemNumber: shirtQuality || '5000',
        color: shirtColor || null,
        productId: productId || null,
        position: 1,
      });

      // ── 6. Attach mockup images directly to the line item ─────────────────
      if (gi === 0 && mockupUrls.length > 0) {
        for (const url of mockupUrls) {
          try {
            await createLineItemMockup(lineItem.id, url);
          } catch (err) {
            console.warn(`Could not attach mockup to line item ${url}:`, err.message);
          }
        }
      }

      // ── 7. Create imprints per group (print locations) ────────────────────
      const imprintInputs = [];

      if (locsEnabled && locations.length > 0) {
        for (let li = 0; li < locations.length; li++) {
          const loc = locations[li];
          const locColors = parseInt(loc.colors) || 1;
          const locDetails = [
            loc.name,
            `${locColors} color${locColors > 1 ? 's' : ''}`,
            loc.art || null,
          ]
            .filter(Boolean)
            .join(' — ');

          const colId = decorationMethod === 'Screen Printing'
            ? (SCREEN_PRINTING_COLUMN_IDS[Math.min(locColors, 6)] || null)
            : null;

          await createImprint({
            lineItemGroupId: group.id,
            details: locDetails,
            typeOfWorkId,
            pricingMatrixColumnId: colId,
          });

          imprintInputs.push({
            details: locDetails,
            typeOfWork: typeOfWorkId ? { id: typeOfWorkId } : undefined,
            pricingMatrixColumn: colId ? { id: colId } : undefined,
          });
        }
      } else if (gi === 0 && decorationMethod) {
        const colId = decorationMethod === 'Screen Printing'
          ? (SCREEN_PRINTING_COLUMN_IDS[Math.min(parsedInkColors, 6)] || null)
          : null;

        await createImprint({
          lineItemGroupId: group.id,
          details: decorationMethod,
          typeOfWorkId,
          pricingMatrixColumnId: colId,
        });

        imprintInputs.push({
          details: decorationMethod,
          typeOfWork: typeOfWorkId ? { id: typeOfWorkId } : undefined,
          pricingMatrixColumn: colId ? { id: colId } : undefined,
        });
      }

      // NOTE: We intentionally do NOT call updateLineItemPrice here.
      // The lineItemGroupPricing query only returns the product markup portion ($3.58),
      // not the full price including print cost. Applying that signature would overwrite
      // our correct calcUnitCost() price ($9.45) with just the product cost.
      // The price set on the line item from calcUnitCost() is already correct.
    }

    return NextResponse.json({
      success: true,
      quoteId: quote.visualId,
      quoteUrl: quote.publicUrl,
    });
  } catch (error) {
    console.error('Error submitting quote to Printavo:', error);
    return NextResponse.json(
      { error: 'Failed to submit quote: ' + error.message },
      { status: 500 }
    );
  }
}
