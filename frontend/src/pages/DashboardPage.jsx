import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { api, clearSession } from "../api";

const DEFAULT_NICHE = "agencies";

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState({});
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [launchForm, setLaunchForm] = useState({ niche: DEFAULT_NICHE, offer: "client acquisition system", templateId: "" });

  const stats = user?.stats || { replies: 0, conversations: 0, campaignsSent: 0, estimatedClients: 0 };
  const milestones = user?.milestones || {};

  const activeTemplates = useMemo(() => templates[launchForm.niche] || [], [templates, launchForm.niche]);

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const [me, leadList, campaignList, templateMap, leadFeed] = await Promise.all([
        api.me(),
        api.listLeads(),
        api.listCampaigns(),
        api.listTemplates(),
        api.getLeadFeed({ niche: launchForm.niche, offer: launchForm.offer })
      ]);

      setUser(me);
      setLeads(leadList);
      setCampaigns(campaignList);
      setTemplates(templateMap);
      setFeed(leadFeed.suggestions || []);

      const firstTemplate = templateMap[launchForm.niche]?.[0]?.id || "";
      setLaunchForm((prev) => ({ ...prev, templateId: prev.templateId || firstTemplate }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!launchForm.niche) {
      return;
    }
    api
      .getLeadFeed({ niche: launchForm.niche, offer: launchForm.offer })
      .then((result) => setFeed(result.suggestions || []))
      .catch(() => {});
  }, [launchForm.niche, launchForm.offer]);

  const onLogout = () => {
    clearSession();
    window.location.href = "/login";
  };

  const onQuickLaunch = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const campaign = await api.launchCampaign(launchForm);
      setMessage("Campaign generated. Send it now to start getting replies.");
      await loadDashboard();
      await onSendCampaign(campaign.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const onSendCampaign = async (id) => {
    setSendingCampaignId(id);
    setMessage("");
    setError("");
    try {
      const result = await api.sendCampaign(id);
      setMessage(`Outreach launched. ${result.sent} emails sent.`);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSendingCampaignId("");
    }
  };

  const onImportFeed = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api.importLeadFeed({ niche: launchForm.niche, offer: launchForm.offer });
      setMessage(`${result.imported} new leads added from your daily feed.`);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const onMarkClientMilestone = async (leadId, status) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await api.updateLead(leadId, { status });
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const onUpgrade = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await api.createCheckoutSession();
      window.location.href = url;
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-950 p-6 text-white">Loading...</div>;
  }

  if (!user) {
    return <div className="min-h-screen bg-slate-950 p-6 text-rose-300">Failed to load dashboard.</div>;
  }

  return (
    <DashboardLayout user={user} onLogout={onLogout}>
      <section className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Get clients faster</h1>
        <p className="max-w-2xl text-slate-300">You already have demo leads and a campaign. Launch outreach now and track replies, meetings, and clients from one screen.</p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Replies</p>
          <p className="mt-2 text-3xl font-semibold">{stats.replies}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Conversations</p>
          <p className="mt-2 text-3xl font-semibold">{stats.conversations}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Campaigns sent</p>
          <p className="mt-2 text-3xl font-semibold">{stats.campaignsSent}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Estimated clients</p>
          <p className="mt-2 text-3xl font-semibold">{stats.estimatedClients}</p>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-5">
        <h2 className="text-xl font-semibold">Launch in one click</h2>
        <p className="mt-1 text-sm text-cyan-100/90">Choose your niche and offer. Leadflow generates the outreach and sends it.</p>
        <form onSubmit={onQuickLaunch} className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            value={launchForm.niche}
            onChange={(event) => {
              const niche = event.target.value;
              const templateId = templates[niche]?.[0]?.id || "";
              setLaunchForm((prev) => ({ ...prev, niche, templateId }));
            }}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
          >
            <option value="agencies">Agencies</option>
            <option value="freelancers">Freelancers</option>
            <option value="local_business">Local business</option>
          </select>
          <input
            value={launchForm.offer}
            onChange={(event) => setLaunchForm((prev) => ({ ...prev, offer: event.target.value }))}
            placeholder="Your offer"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
            required
          />
          <select
            value={launchForm.templateId}
            onChange={(event) => setLaunchForm((prev) => ({ ...prev, templateId: event.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
          >
            {activeTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="md:col-span-3 rounded-md bg-cyan-500 px-4 py-3 text-base font-semibold text-slate-950 disabled:opacity-70"
          >
            {busy ? "Launching..." : "SEND CAMPAIGN"}
          </button>
        </form>
      </section>

      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-emerald-300">{message}</p> : null}

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Daily lead feed</h2>
          <p className="mt-1 text-sm text-slate-300">Suggested leads for your offer today.</p>
          <div className="mt-3 space-y-2">
            {feed.map((item) => (
              <div key={item.email} className="flex items-center justify-between border-b border-slate-800 py-2 text-sm">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-slate-400">{item.email}</p>
                </div>
                <p className="text-slate-500">{item.customFields?.niche}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onImportFeed}
            disabled={busy}
            className="mt-4 rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-70"
          >
            Add Daily Feed Leads
          </button>
        </div>

        <div>
          <h2 className="text-xl font-semibold">First client milestones</h2>
          <div className="mt-3 space-y-2 text-sm">
            <p className={milestones.firstReplyAt ? "text-emerald-300" : "text-slate-400"}>First reply {milestones.firstReplyAt ? "achieved" : "pending"}</p>
            <p className={milestones.firstMeetingAt ? "text-emerald-300" : "text-slate-400"}>First meeting {milestones.firstMeetingAt ? "achieved" : "pending"}</p>
            <p className={milestones.firstClientAt ? "text-emerald-300" : "text-slate-400"}>First client {milestones.firstClientAt ? "achieved" : "pending"}</p>
          </div>

          <div className="mt-4 space-y-2">
            {leads.slice(0, 6).map((lead) => (
              <div key={lead.id} className="flex items-center justify-between border-b border-slate-800 py-2">
                <div>
                  <p className="text-sm font-medium">{lead.name}</p>
                  <p className="text-xs text-slate-400">{lead.status}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onMarkClientMilestone(lead.id, "REPLIED")}
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarkClientMilestone(lead.id, "MEETING")}
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Meeting
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarkClientMilestone(lead.id, "CLIENT")}
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                  >
                    Client
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {user.viralUnlockReady ? (
        <section className="mt-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h3 className="text-lg font-semibold">Want more replies?</h3>
          <p className="mt-1 text-sm text-emerald-100">Invite 2 friends with your code <span className="font-semibold">{user.referralCode}</span> and unlock more daily leads.</p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Recent campaigns</h2>
        <div className="mt-3 space-y-2">
          {campaigns.slice(0, 6).map((campaign) => (
            <div key={campaign.id} className="flex items-center justify-between border-b border-slate-800 py-2">
              <div>
                <p className="font-medium">{campaign.name}</p>
                <p className="text-sm text-slate-400">Sent: {campaign.sentCount}</p>
              </div>
              <button
                type="button"
                onClick={() => onSendCampaign(campaign.id)}
                disabled={sendingCampaignId === campaign.id}
                className="rounded-md border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800 disabled:opacity-70"
              >
                {sendingCampaignId === campaign.id ? "Sending..." : "Send"}
              </button>
            </div>
          ))}
          {campaigns.length === 0 ? <p className="text-sm text-slate-400">No campaigns yet.</p> : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Billing</h2>
        <button
          type="button"
          onClick={onUpgrade}
          disabled={busy || user.role === "PRO"}
          className="mt-3 rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-950 disabled:opacity-70"
        >
          {user.role === "PRO" ? "You are on PRO" : "Upgrade to PRO"}
        </button>
      </section>
    </DashboardLayout>
  );
}
