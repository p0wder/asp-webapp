/**
 * SanMar SOAP request auth-block builders.
 *
 * SanMar's own API is inconsistent about how each service embeds
 * credentials in the request body — this module centralizes the shapes
 * used by the services implemented so far (Product Info, Pricing,
 * Inventory). Purchase Order reuses buildStandardAuthBlock(); Invoicing and
 * Notifications use different field names/shapes and will get their own
 * builders when those services are implemented.
 */

import { readSanMarCredentials } from './config.js';

/** Escapes XML special characters in an interpolated string value. */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds the standard SanMar auth block used by Product Info, Pricing, and
 * Purchase Order services — a named object (commonly `<arg1>`) containing
 * sanMarCustomerNumber / sanMarUserName / sanMarUserPassword, plus optional
 * third-party senderId / senderPassword (left blank — this integration
 * authenticates directly as the SanMar account, not as a third-party
 * sender on the account's behalf).
 *
 * @param {string} argTag - the wrapper element name, e.g. 'arg1' or 'arg0'
 *   (SanMar's operations are inconsistent about which arg index carries auth).
 */
export function buildStandardAuthBlock(argTag) {
  const { customerNumber, username, password } = readSanMarCredentials();
  return `<${argTag}>
    <senderId></senderId>
    <senderPassword></senderPassword>
    <sanMarCustomerNumber>${escapeXml(customerNumber)}</sanMarCustomerNumber>
    <sanMarUserName>${escapeXml(username)}</sanMarUserName>
    <sanMarUserPassword>${escapeXml(password)}</sanMarUserPassword>
  </${argTag}>`;
}

/**
 * Builds the positional auth args used by the Inventory service
 * (getInventoryQtyForStyleColorSize[ByWhse]) — arg0/arg1/arg2 as bare
 * values, not a named object.
 */
export function buildInventoryAuthArgs() {
  const { customerNumber, username, password } = readSanMarCredentials();
  return `<arg0>${escapeXml(customerNumber)}</arg0>
  <arg1>${escapeXml(username)}</arg1>
  <arg2>${escapeXml(password)}</arg2>`;
}
