// Public configuration only. Never put credentials or private keys here.
// The local preview server replaces the HTML meta value using BOOKING_API_URL.
const configured = typeof document === 'undefined' ? '' : document.querySelector('meta[name="booking-api-url"]')?.content;
const base = (configured || 'http://127.0.0.1:8000/api/booking/v1').replace(/\/$/, '');
export const websiteOrigin = new URL(base).origin;

export class ApiError extends Error {
  constructor(message, status = 0, errors = {}) { super(message); this.status = status; this.errors = errors; }
}

export async function request(path, { method = 'GET', data, key, signal, fetcher = fetch } = {}) {
  let response;
  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    response = await fetcher(`${base}${path}`, { method, signal: requestSignal, credentials: 'omit', cache: 'no-store',
      headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}) });
  } catch (error) {
    if (timeout.aborted) throw new ApiError('The service took too long to respond. Please retry with the same details.');
    if (error.name === 'AbortError') throw error;
    throw new ApiError('We could not reach the booking service. Please check your connection and try again.');
  }
  let body;
  try { body = await response.json(); }
  catch { throw new ApiError('The booking service is temporarily unavailable. Please try again shortly.', response.status); }
  if (!response.ok) {
    const errors = Object.fromEntries(Object.entries(body.errors || {}).map(([key, value]) => [key.split('.')[0], Array.isArray(value) ? value[0] : value]));
    const message = response.status === 429 ? 'Too many requests. Please wait a minute before trying again.'
      : response.status >= 500 ? 'The booking service is temporarily unavailable. Please try again shortly.'
      : body.message || 'We could not complete your request. Please try again.';
    throw new ApiError(message, response.status, errors);
  }
  if (!Object.hasOwn(body, 'data')) throw new ApiError('The booking service returned an unexpected response. Please try again.');
  return body.data;
}

export const loadProgrammes = () => request('/programmes');
export const loadAvailability = (id, date, locationId, signal) => request(`/programmes/${encodeURIComponent(id)}/availability?${new URLSearchParams({ date, locationId })}`, { signal });

export function submissionData(programme, draft, bookable) {
  const data = { programmeId: programme.id, name: draft.name, phone: draft.phone, email: draft.email || null, consent: draft.consent === true, company: draft.company || '' };
  const fields = bookable ? ['count', 'ages', 'topic', ...(programme.mode === 'published' ? ['sessionId'] : ['slotId', 'date', 'locationId'])]
    : ['message', ...(programme.enquiryType === 'school' ? ['school', 'level'] : []), ...(programme.enquiryType === 'event' ? ['eventType', 'preferredDate', 'venue', 'attendance'] : [])];
  for (const key of fields) if (draft[key] !== undefined && draft[key] !== '') data[key] = draft[key];
  return data;
}

export async function submitRequest(programme, draft, bookable, key) {
  const receipt = await request(bookable ? '/bookings' : '/enquiries', { method: 'POST', data: submissionData(programme, draft, bookable), key });
  if (!receipt?.id || !['pending', 'confirmed', 'cancelled', 'declined', 'completed'].includes(receipt.status) || !receipt.createdAt) {
    throw new ApiError('We could not verify the saved request. Retry with the same details or contact our team.');
  }
  return receipt;
}

// Reuse a key after a network failure, but use a new one for an edited request.
// Kept in page memory only; no personal details are saved in browser storage.
export function submissionKey() {
  let previous = '', key;
  return data => { const value = JSON.stringify(data); if (value !== previous) { previous = value; key = crypto.randomUUID(); } return key; };
}
