import { NextResponse } from 'next/server';
import { fetchSSProduct } from '@/lib/ssActivewear';

/**
 * GET /api/garment-pricing?styles=5000,6210
 *
 * Fetches wholesale pricing from S&S Activewear for one or more style numbers.
 * Falls back to mock data when SS credentials are not yet configured.
 *
 * Query params:
 *   styles - comma-separated style numbers, e.g. "5000" or "5000,6210"
 *
 * Returns a map keyed by style number:
 *   {
 *     "5000": {
 *       styleNumber: "5000",
 *       brand: "Gildan",
 *       description: "Heavy Cotton T-Shirt",
 *       customerPrice: 3.11,   ← lowest customerPrice across all variants (use for cost calc)
 *       isMock: true           ← present when using mock data, remove check once real API is live
 *     },
 *     "6210": { ... }
 *   }
 *
 * The client uses customerPrice as the wholesale garment cost per unit.
 * Printavo screenshot shows: "$3.58 ($3.11 Product * 115% Markup) + $5.39 (Print Cost)"
 * So: customerPrice = product cost, markup is applied on top in Printavo.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const styles = searchParams.get('styles');

  if (!styles) {
    return NextResponse.json(
      { error: 'Missing required param: styles (e.g. ?styles=5000,6210)' },
      { status: 400 }
    );
  }

  try {
    const products = await fetchSSProduct(styles);
    const isMock = !process.env.SS_ACTIVEWEAR_USERNAME || !process.env.SS_ACTIVEWEAR_PASSWORD;

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
          ...(isMock ? { isMock: true } : {}),
        };
      } else if (customerPrice != null && (result[styleNum].customerPrice == null || customerPrice < result[styleNum].customerPrice)) {
        // Keep the lowest customerPrice across all color/size variants
        result[styleNum].customerPrice = customerPrice;
      }
    }

    console.log(`[garment-pricing] styles="${styles}" isMock=${isMock} returned ${Object.keys(result).length} styles`);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[garment-pricing] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
