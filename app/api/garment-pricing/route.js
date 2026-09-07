import { NextResponse } from 'next/server';
import { fetchSSProductsByStyleNumbers } from '@/lib/ssActivewear';
import { isSameOrigin } from '@/lib/httpGuards';
import { rateLimit, clientKey, RATE_LIMIT_POLICIES } from '@/lib/rateLimit';

/** Bounds the S&S catalog fan-out one request can trigger (TG-001-07). */
const MAX_STYLES_PER_REQUEST = 25;

/**
 * GET /api/garment-pricing?styles=5000,6210
 *
 * Fetches live wholesale pricing from S&S Activewear for one or more style numbers.
 * Style numbers are resolved to S&S styleIDs via STYLE_ID_MAP in lib/ssActivewear.js.
 *
 * Query params:
 *   styles - comma-separated style numbers, e.g. "5000" or "5000,6210"
 *
 * Returns a map keyed by style number:
 *   {
 *     "5000": {
 *       styleNumber: "5000",
 *       brand: "Gildan",
 *       description: "Unisex Heavy Cotton™ T-Shirt",
 *       customerPrice: 2.38   ← lowest customerPrice across all variants (use for cost calc)
 *     },
 *     "6210": { ... }
 *   }
 *
 * The client uses customerPrice as the wholesale garment cost per unit.
 * Printavo: customerPrice = product cost, markup is applied on top.
 */
export async function GET(request) {
  // ── Origin guard: only allow requests from this app's frontend ──────────
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = rateLimit(clientKey(request, 'garment-pricing'), RATE_LIMIT_POLICIES.garmentPricing);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const styles = searchParams.get('styles');

  if (!styles) {
    return NextResponse.json(
      { error: 'Missing required param: styles (e.g. ?styles=5000,6210)' },
      { status: 400 }
    );
  }

  // Bound the catalog fan-out: without this, one request can ask S&S for an
  // arbitrary number of styles (TG-001-07 AC1).
  const requestedStyles = styles.split(',').map((s) => s.trim()).filter(Boolean);
  if (requestedStyles.length === 0 || requestedStyles.length > MAX_STYLES_PER_REQUEST) {
    return NextResponse.json(
      { error: `styles must list between 1 and ${MAX_STYLES_PER_REQUEST} style numbers` },
      { status: 400 },
    );
  }

  try {
    const products = await fetchSSProductsByStyleNumbers(styles);

    // Group variants by styleName and find the lowest customerPrice per style
    const result = {};

    for (const variant of products || []) {
      const styleNum = variant.styleName || variant.styleNumber || variant.style || '';
      if (!styleNum) continue;

      const customerPrice = variant.customerPrice ?? variant.piecePrice ?? null;

      if (!result[styleNum]) {
        result[styleNum] = {
          styleNumber: styleNum,
          brand: variant.brandName || variant.brand || '',
          description: variant.title || variant.description || `${variant.brandName || ''} ${styleNum}`.trim(),
          customerPrice,
        };
      } else if (customerPrice != null && (result[styleNum].customerPrice == null || customerPrice < result[styleNum].customerPrice)) {
        // Keep the lowest customerPrice across all color/size variants
        result[styleNum].customerPrice = customerPrice;
      }
    }

    console.log(`[garment-pricing] requested=${requestedStyles.length} returned=${Object.keys(result).length}`);
    for (const [styleNum, data] of Object.entries(result)) {
      console.log(`  ${styleNum} | ${data.brand} | customerPrice=$${data.customerPrice}`);
    }
    return NextResponse.json(result);
  } catch (err) {
    // The S&S error text can embed a vendor payload — log it, never return it.
    console.error('[garment-pricing] error:', err?.message || err);
    return NextResponse.json({ error: 'Pricing lookup failed' }, { status: 502 });
  }
}
