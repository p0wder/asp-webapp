import { NextResponse } from 'next/server';
import { fetchSSProductsByStyleNumbers } from '@/lib/ssActivewear';

/**
 * Returns true if the request originates from the app's own frontend.
 * Checks the Origin header against NEXTAUTH_URL (falls back to allowing
 * localhost in development when NEXTAUTH_URL is not set).
 */
function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false; // server-to-server requests with no Origin header are blocked
  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  // Allow exact match or localhost variants in development
  return origin === appUrl || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
}

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

  const { searchParams } = new URL(request.url);
  const styles = searchParams.get('styles');

  if (!styles) {
    return NextResponse.json(
      { error: 'Missing required param: styles (e.g. ?styles=5000,6210)' },
      { status: 400 }
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

    console.log(`[garment-pricing] styles="${styles}" returned ${Object.keys(result).length} styles:`);
    for (const [styleNum, data] of Object.entries(result)) {
      console.log(`  ${styleNum} | ${data.brand} | ${data.description} | customerPrice=$${data.customerPrice}`);
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[garment-pricing] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
