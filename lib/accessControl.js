import { auth } from '@clerk/nextjs/server';
import { getCustomerEmail } from '@/lib/customerAuth';
import { verifyStatusToken, verifyProofToken, verifyQuoteApprovalToken } from '@/lib/orderStatus';

async function checkInvoiceAccess(invoiceContactEmail, tokenVerified) {
  try {
    const { userId } = await auth();
    if (userId) {
      const email = await getCustomerEmail(userId);
      if (email && email === invoiceContactEmail) return { granted: true };
      return { granted: false, status: 403 }; // logged in but wrong email
    }
  } catch { /* auth() may throw outside request context */ }

  if (tokenVerified) return { granted: true };
  return { granted: false, status: 403 };
}

export async function verifyStatusAccess(invoiceId, invoice, { token } = {}) {
  const secret = process.env.STATUS_TOKEN_SECRET;
  const tokenVerified = verifyStatusToken(invoiceId, token, secret);
  return checkInvoiceAccess(invoice?.contact?.email, tokenVerified);
}

export async function verifyProofAccess(invoiceId, invoice, { token } = {}) {
  const secret = process.env.STATUS_TOKEN_SECRET;
  const tokenVerified = verifyProofToken(invoiceId, token, secret);
  return checkInvoiceAccess(invoice?.contact?.email, tokenVerified);
}

export async function verifyQuoteApprovalAccess(invoiceId, invoice, { token } = {}) {
  const secret = process.env.STATUS_TOKEN_SECRET;
  const tokenVerified = verifyQuoteApprovalToken(invoiceId, token, secret);
  return checkInvoiceAccess(invoice?.contact?.email, tokenVerified);
}
