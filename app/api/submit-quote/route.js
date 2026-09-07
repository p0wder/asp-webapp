import { NextResponse } from 'next/server';
import { isSameOrigin, readJsonBody, isBoundedArray } from '@/lib/httpGuards';
import { rateLimit, clientKey, RATE_LIMIT_POLICIES } from '@/lib/rateLimit';
import { logMutation, newCorrelationId, PHASES } from '@/lib/mutationLog';

/**
 * Bounds on the public quote payload (TG-001-07 AC1). Each Printavo line item
 * and artwork URL becomes at least one external mutation, so an unbounded
 * array here is an unbounded write amplification against Printavo.
 */
const MAX_QUOTE_ITEMS = 50;
const MAX_ARTWORK_URLS = 25;
const MAX_QUOTE_BODY_BYTES = 256 * 1024;

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
} from '@/lib/printavo';
import { calcUnitCost } from '@/lib/pricing';
import { fetchSSProductsByStyleNumbers } from '@/lib/ssActivewear';
import { generateStatusToken } from '@/lib/orderStatus';
import { getCodeByString } from '@/lib/promoCodesStorage';
import { validateCode, applyDiscount, incrementUse, discountLabel } from '@/lib/promoCodes';

const QUOTE_STATUS_ID = '256246';
const SCREEN_PRINTING_CATEGORY_ID = '178403';

const SCREEN_PRINTING_COLUMN_IDS = {
  1: '31382632', 2: '31382633', 3: '31382634',
  4: '31382635', 5: '31382636', 6: '31382637',
};

const TYPE_OF_WORK_IDS = {
  'Screen Printing': '11802',
  'Embroidery': '11803',
  'DTF': '14172',
};

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = rateLimit(clientKey(request, 'submit-quote'), RATE_LIMIT_POLICIES.submitQuote);
  if (!limit.allowed) {
    console.warn('[submit-quote] rate limited');
    return NextResponse.json(
      { error: 'Too many quote requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await readJsonBody(request, { maxBytes: MAX_QUOTE_BODY_BYTES });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  // One ID across every Printavo write this request makes, so a partially
  // created quote can be traced end to end (TG-001-08 AC2).
  const correlationId = newCorrelationId();

  try {
    const body = parsed.body || {};

    const {
      fname,
      lname,
      email,
      phone,
      company,
      dueDate,
      notes,
      jobName,
      quoteItems = [],
      artworkUrls = [],
      billingAddress = null,
      shippingAddress = null,
      promoCode: promoCodeStr = null,
    } = body;

    if (!isBoundedArray(quoteItems, { min: 1, max: MAX_QUOTE_ITEMS })) {
      return NextResponse.json(
        { error: `quoteItems must contain between 1 and ${MAX_QUOTE_ITEMS} items` },
        { status: 400 },
      );
    }
    if (!isBoundedArray(artworkUrls, { max: MAX_ARTWORK_URLS })) {
      return NextResponse.json(
        { error: `artworkUrls must contain at most ${MAX_ARTWORK_URLS} entries` },
        { status: 400 },
      );
    }

    // ── Build job nickname ────────────────────────────────────────────────────
    const resolvedJobName =
      jobName?.trim() ||
      quoteItems.map((i) => i.garmentType).join(' + ') ||
      `${fname} ${lname}`.trim();

    // ── Build production note summarising all items ───────────────────────────
    const itemLines = quoteItems.map((item, idx) => {
      const colorLabel = item.decorationMethod === 'Embroidery' ? 'thread colors' : 'ink colors';
      const colorPart = ['Screen Printing', 'DTF', 'Embroidery'].includes(item.decorationMethod) && item.inkColors
        ? `, ${item.inkColors} ${colorLabel}`
        : '';
      const colorPiece = item.shirtColor ? `, ${item.shirtColor}` : '';
      return `Item ${idx + 1}: ${item.garmentType} — ${item.decorationMethod}, qty ${item.qty}${colorPiece}${colorPart}`;
    });
    const productionNote = itemLines.join('\n') || null;

    // ── Build customer note ───────────────────────────────────────────────────
    const artworkSection =
      artworkUrls.length > 0
        ? `Artwork (${artworkUrls.length} file${artworkUrls.length > 1 ? 's' : ''}):\n${artworkUrls.map((f) => `• ${f.name}: ${f.url}`).join('\n')}`
        : null;
    const notesSection = notes ? `━━━ NOTES / SPECIAL REQUESTS ━━━\n${notes}` : null;
    const customerNote = [notesSection, artworkSection].filter(Boolean).join('\n\n') || null;

    // ── 1. Find or create customer ────────────────────────────────────────────
    let contactId = null;
    try {
      const existing = await findContactByEmail(email);
      if (existing) contactId = existing.id;
    } catch {
      // Non-fatal — fall through to create
    }
    if (!contactId) {
      const newCustomer = await createCustomer({
        firstName: fname, lastName: lname || '', email,
        phone: phone || null, companyName: company || null, address: billingAddress || null,
      });
      contactId = newCustomer.primaryContact.id;
    }

    // ── 2. Create the quote ───────────────────────────────────────────────────
    const toQuoteAddress = (addr) => addr ? {
      address1: addr.address1 || null, address2: addr.address2 || null,
      city: addr.city || null, stateIso: addr.state || null,
      zipCode: addr.zip || null, countryIso: 'US',
    } : null;

    const quote = await createQuote({
      contactId, nickname: resolvedJobName,
      customerDueAt: dueDate || null,
      customerNote: customerNote || null,
      productionNote,
      billingAddress: toQuoteAddress(billingAddress),
      shippingAddress: toQuoteAddress(shippingAddress),
    });
    const quoteId = quote.id;

    // ── 3. Set status to "Quote" ──────────────────────────────────────────────
    try {
      await setQuoteStatus(quoteId, QUOTE_STATUS_ID);
    } catch (err) {
      console.warn('Could not set quote status:', err.message);
    }

    // ── 4. Fetch S&S wholesale prices for each unique style (cached per-call) ─
    const wholesalePriceByStyle = {};

    for (const item of quoteItems) {
      const styleNumber = item.shirtQuality || '5000';
      if (styleNumber in wholesalePriceByStyle) continue;
      try {
        const ssProducts = await fetchSSProductsByStyleNumbers(styleNumber);
        const prices = ssProducts
          .map((v) => v.customerPrice ?? v.piecePrice ?? null)
          .filter((p) => p != null);
        wholesalePriceByStyle[styleNumber] = prices.length > 0 ? Math.min(...prices) : 0;
        console.log(`[submit-quote] style=${styleNumber} wholesale=$${wholesalePriceByStyle[styleNumber]}`);
      } catch (err) {
        console.warn(`[submit-quote] Could not fetch S&S price for ${styleNumber}:`, err.message);
        wholesalePriceByStyle[styleNumber] = 0;
      }
    }

    // ── 5. Compute per-item pricing, accumulate grand total ───────────────────
    const pricedItems = quoteItems.map((item) => {
      const parsedQty = parseInt(item.qty) || 1;
      const parsedInkColors = parseInt(item.inkColors) || 1;
      const styleNumber = item.shirtQuality || '5000';
      const wholesale = wholesalePriceByStyle[styleNumber] ?? 0;
      const garmentCost = parseFloat((wholesale * 1.15).toFixed(2));
      const canEstimate = item.decorationMethod === 'Screen Printing' || item.decorationMethod === 'DTF';
      const decorationCost = canEstimate ? (calcUnitCost(parsedQty, parsedInkColors, false, []) ?? 0) : 0;
      const unitCost = parseFloat((garmentCost + decorationCost).toFixed(2));
      const itemTotal = parseFloat((unitCost * parsedQty).toFixed(2));
      return { ...item, parsedQty, parsedInkColors, styleNumber, garmentCost, decorationCost, unitCost, itemTotal };
    });

    let grandTotal = pricedItems.reduce((sum, ip) => sum + ip.itemTotal, 0);
    grandTotal = parseFloat(grandTotal.toFixed(2));

    console.log(`[submit-quote] items=${quoteItems.length} grandTotal=$${grandTotal}`);

    // ── 5a. Apply promo discount proportionally across items ──────────────────
    let appliedPromo = null;
    if (promoCodeStr) {
      try {
        const promoFound = await getCodeByString(promoCodeStr);
        const promoReason = validateCode(promoFound, new Date().toISOString(), email);
        if (!promoReason && promoFound) {
          const discountAmount = applyDiscount(promoFound, grandTotal);
          const discountFraction = grandTotal > 0 ? discountAmount / grandTotal : 0;
          for (const ip of pricedItems) {
            const itemDiscount = ip.itemTotal * discountFraction;
            ip.unitCost = parseFloat(Math.max(0, ip.unitCost - itemDiscount / ip.parsedQty).toFixed(2));
          }
          grandTotal = parseFloat(Math.max(0, grandTotal - discountAmount).toFixed(2));
          appliedPromo = { code: promoFound.code, label: discountLabel(promoFound), discountAmount };
          try {
            const { saveCode } = await import('@/lib/promoCodesStorage');
            await saveCode(incrementUse(promoFound));
          } catch (err) {
            console.warn('[submit-quote] could not increment promo use count:', err.message);
          }
          console.log(`[submit-quote] promo=${promoFound.code} discount=$${discountAmount} newTotal=$${grandTotal}`);
        } else if (promoReason) {
          console.warn(`[submit-quote] promo code "${promoCodeStr}" rejected: ${promoReason}`);
        }
      } catch (err) {
        console.warn('[submit-quote] promo code lookup failed:', err.message);
      }
    }

    // ── 6. Create one line item group per quote item ──────────────────────────
    const mockupUrls = artworkUrls.filter((f) => f.url).map((f) => f.url);

    for (let gi = 0; gi < pricedItems.length; gi++) {
      const ip = pricedItems[gi];
      const group = await createLineItemGroup(quoteId, gi + 1);

      let productId = null;
      try {
        productId = await findProductId(ip.styleNumber, ip.shirtColor || null);
      } catch {
        // Non-fatal
      }

      const typeOfWorkId = TYPE_OF_WORK_IDS[ip.decorationMethod] || null;
      const categoryId = ip.decorationMethod === 'Screen Printing' || ip.decorationMethod === 'DTF'
        ? SCREEN_PRINTING_CATEGORY_ID
        : null;

      const lineItem = await createLineItem({
        lineItemGroupId: group.id,
        description: ip.garmentType,
        quantity: ip.parsedQty,
        price: ip.unitCost,
        categoryId,
        itemNumber: ip.styleNumber,
        color: ip.shirtColor || null,
        productId: productId || null,
        markupPercentage: 115,
        position: 1,
      });

      // Attach artwork mockups to the first line item group only
      if (gi === 0 && mockupUrls.length > 0) {
        for (const url of mockupUrls) {
          try {
            await createLineItemMockup(lineItem.id, url);
          } catch (err) {
            console.warn(`Could not attach mockup ${url}:`, err.message);
          }
        }
      }

      // Create imprint for this item's decoration method
      if (ip.decorationMethod && ip.decorationMethod !== 'Not Sure') {
        const colId = ip.decorationMethod === 'Screen Printing'
          ? (SCREEN_PRINTING_COLUMN_IDS[Math.min(ip.parsedInkColors, 6)] || null)
          : null;

        const colorLabel = ip.decorationMethod === 'Embroidery' ? 'thread colors' : 'ink colors';
        const showColors = ['Screen Printing', 'DTF', 'Embroidery'].includes(ip.decorationMethod);
        const imprintDetails = [
          ip.decorationMethod,
          showColors ? `${ip.parsedInkColors} ${colorLabel}` : null,
        ].filter(Boolean).join(' — ');

        await createImprint({
          lineItemGroupId: group.id,
          details: imprintDetails,
          typeOfWorkId,
          pricingMatrixColumnId: colId,
        });
      }
    }

    // ── Generate signed order-status URL ─────────────────────────────────────
    let statusUrl = null;
    const statusSecret = process.env.STATUS_TOKEN_SECRET;
    if (statusSecret) {
      const token = generateStatusToken(quote.id, statusSecret);
      statusUrl = `/order-status?id=${encodeURIComponent(quote.id)}&token=${token}`;
    }

    logMutation({
      correlationId,
      system: 'printavo',
      operation: 'createQuote',
      phase: PHASES.SUCCESS,
      fields: {
        quoteId: quote.id,
        visualId: quote.visualId,
        itemCount: quoteItems.length,
        artworkCount: artworkUrls.length,
      },
    });

    return NextResponse.json({
      success: true,
      quoteId: quote.visualId,
      printavoId: quote.id,
      quoteUrl: quote.publicUrl,
      statusUrl,
      appliedPromo,
      correlationId,
    });
  } catch (error) {
    logMutation({
      correlationId,
      system: 'printavo',
      operation: 'createQuote',
      phase: PHASES.FAILURE,
      error,
    });
    // The Printavo error text can embed the submitted payload, so it is not
    // echoed to a public caller. `correlationId` is how support finds it.
    return NextResponse.json(
      { error: 'Failed to submit quote. Please try again or contact us.', correlationId },
      { status: 500 }
    );
  }
}
