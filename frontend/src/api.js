const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

function getToken() {
  return localStorage.getItem("leadflow_token");
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const message = data?.message || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

export const api = {
  register: (payload) => request("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/api/auth/me"),
  listLeads: () => request("/api/leads"),
  getLeadFeed: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/api/leads/feed${query ? `?${query}` : ""}`);
  },
  importLeadFeed: (payload) => request("/api/leads/feed/import", { method: "POST", body: JSON.stringify(payload) }),
  createLead: (payload) => request("/api/leads", { method: "POST", body: JSON.stringify(payload) }),
  updateLead: (id, payload) => request(`/api/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteLead: (id) => request(`/api/leads/${id}`, { method: "DELETE" }),
  importCsv: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return request("/api/import/csv", { method: "POST", body: formData });
  },
  listCampaigns: () => request("/api/campaigns"),
  listTemplates: () => request("/api/campaigns/templates"),
  launchCampaign: (payload) => request("/api/campaigns/launch", { method: "POST", body: JSON.stringify(payload) }),
  createCampaign: (payload) => request("/api/campaigns", { method: "POST", body: JSON.stringify(payload) }),
  sendCampaign: (id) => request(`/api/campaigns/${id}/send`, { method: "POST" }),
  createCheckoutSession: () => request("/api/billing/checkout-session", { method: "POST" })
};

export function persistSession(token) {
  localStorage.setItem("leadflow_token", token);
}

export function clearSession() {
  localStorage.removeItem("leadflow_token");
}

export function hasSession() {
  return Boolean(getToken());
}