import { NextResponse } from 'next/server';
import {
  findContactByEmail,
  createCustomer,
  createQuote,
  setQuoteStatus,
  createLineItemGroup,
  createLineItem,
  createImprint,
  createImprintMockup,
  createLineItemMockup,
} from '@/lib/printavo';
import { calcUnitCost } from '@/lib/pricing';

// Printavo status ID for "Quote"
const QUOTE_STATUS_ID = '256246';

// Printavo category ID for Screen Printing (from original code)
const SCREEN_PRINTING_CATEGORY_ID = '178403';

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
      address = null,
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
      // Customer not found — create a new one
      const newCustomer = await createCustomer({
        firstName: fname,
        lastName: lname || '',
        email,
        phone: phone || null,
        companyName: company || null,
        address: address || null,
      });
      contactId = newCustomer.primaryContact.id;
    }

    // ── 2. Create the quote ──────────────────────────────────────────────────
    const fullCustomerNote = [
      customerNote,
    ]
      .filter(Boolean)
      .join('\n');

    const quote = await createQuote({
      contactId,
      nickname: resolvedJobName,
      customerDueAt: dueDate || null,
      customerNote: fullCustomerNote,
      productionNote,
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

    for (let gi = 0; gi < garmentTypes.length; gi++) {
      const garmentType = garmentTypes[gi];
      const group = await createLineItemGroup(quoteId, gi + 1);

      // Create the line item with category set to Screen Printing category
      const lineItem = await createLineItem({
        lineItemGroupId: group.id,
        description: garmentType,
        quantity: parsedQty,
        price: resolvedUnitCost,
        categoryId: SCREEN_PRINTING_CATEGORY_ID,
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
      if (locsEnabled && locations.length > 0) {
        for (let li = 0; li < locations.length; li++) {
          const loc = locations[li];
          const locDetails = [
            loc.name,
            `${loc.colors} color${loc.colors > 1 ? 's' : ''}`,
            loc.art || null,
          ]
            .filter(Boolean)
            .join(' — ');

          await createImprint({
            lineItemGroupId: group.id,
            details: locDetails,
          });
        }
      } else if (gi === 0 && decorationMethod) {
        // No specific locations — create a single imprint for the decoration method
        await createImprint({
          lineItemGroupId: group.id,
          details: decorationMethod,
        });
      }
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
