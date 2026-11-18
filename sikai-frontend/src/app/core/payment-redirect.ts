export interface RedirectPayment {
  status: string;
  redirect?: { method: string; url: string; fields: Record<string, string> };
}
/** Submit only server-built provider destinations, preserving eSewa's signed POST fields. */
export function redirectToPayment(payment: RedirectPayment): void {
  const redirect = payment.redirect;
  if (!redirect || payment.status !== 'pending') throw new Error('Payment is not ready. Check payment status before trying again.');
  const url = new URL(redirect.url);
  const hosts = ['rc.esewa.com.np', 'rc-epay.esewa.com.np', 'epay.esewa.com.np', 'pay.khalti.com', 'test-pay.khalti.com', 'www.sandbox.paypal.com', 'www.paypal.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) throw new Error('Invalid payment destination.');
  if (redirect.method === 'GET') { window.location.assign(redirect.url); return; }
  if (redirect.method !== 'POST') throw new Error('Invalid payment submission method.');
  const form = document.createElement('form'); form.method = 'POST'; form.action = redirect.url; form.hidden = true;
  for (const [name, value] of Object.entries(redirect.fields)) {
    const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input);
  }
  document.body.appendChild(form); form.submit();
}
