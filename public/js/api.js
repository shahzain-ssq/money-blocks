export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    // Non-JSON response; keep data null.
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error ||
      `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error?.code || 'request_failed';
    error.data = data;
    throw error;
  }

  return data ?? {};
}

export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  return err.message || fallback;
}
