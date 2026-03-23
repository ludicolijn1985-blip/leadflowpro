const TEMPLATES = {
  agencies: [
    {
      id: "agencies-1",
      label: "Booked Calls Fast",
      subject: "Quick idea to add 3-5 meetings this month",
      body: "Hi {{name}},\n\nI help agencies like yours turn cold lists into booked meetings in under 14 days.\n\nIf I show you a simple outreach flow for {{offer}}, would you be open to a 15-minute call next week?\n\nBest,\n{{sender}}"
    },
    {
      id: "agencies-2",
      label: "Audit Hook",
      subject: "I recorded a 2-minute pipeline audit for {{company}}",
      body: "Hi {{name}},\n\nI noticed a few easy fixes in your outreach pipeline that could increase replies quickly.\n\nWant me to send the short audit and a suggested sequence for {{offer}}?\n\nBest,\n{{sender}}"
    }
  ],
  freelancers: [
    {
      id: "freelancers-1",
      label: "Simple Offer Pitch",
      subject: "Can I send you a quick {{offer}} idea?",
      body: "Hi {{name}},\n\nI work with freelancers to get more inbound client conversations without paid ads.\n\nI drafted a simple outreach angle for {{offer}} that usually gets replies in 48 hours.\n\nShould I send it over?\n\nBest,\n{{sender}}"
    },
    {
      id: "freelancers-2",
      label: "Niche Positioning",
      subject: "You could close more with one small positioning shift",
      body: "Hi {{name}},\n\nI noticed your work in {{niche}} and had a clear idea to make your outreach more client-focused.\n\nIf useful, I can share the script and follow-up flow for {{offer}}.\n\nBest,\n{{sender}}"
    }
  ],
  local_business: [
    {
      id: "local-1",
      label: "Local Growth",
      subject: "A quick way to generate more local enquiries",
      body: "Hi {{name}},\n\nI help local businesses consistently get new enquiries using short outbound campaigns.\n\nWould you like a ready-to-send sequence tailored for {{offer}}?\n\nBest,\n{{sender}}"
    },
    {
      id: "local-2",
      label: "Competitor Angle",
      subject: "I found a gap your competitors are missing",
      body: "Hi {{name}},\n\nI noticed a high-intent customer segment in your area that is still under-served.\n\nI can share a campaign that targets them directly around {{offer}}.\n\nInterested?\n\nBest,\n{{sender}}"
    }
  ]
};

export function listSequenceTemplates() {
  return TEMPLATES;
}

export function getTemplate(niche, templateId) {
  const key = String(niche || "").toLowerCase();
  const group = TEMPLATES[key] || [];
  if (!templateId) {
    return group[0] || null;
  }
  return group.find((item) => item.id === templateId) || null;
}

export function buildLeadSuggestions(niche, offer) {
  const safeNiche = String(niche || "business").toLowerCase();
  const safeOffer = String(offer || "growth support").trim() || "growth support";
  const timestamp = Date.now();

  return Array.from({ length: 5 }).map((_, index) => {
    const base = `${safeNiche.replace(/[^a-z0-9]/g, "") || "lead"}${index + 1}${timestamp.toString().slice(-5)}`;
    return {
      name: `${safeNiche.replace(/_/g, " ")} lead ${index + 1}`,
      email: `${base}@example.com`,
      status: "NEW",
      customFields: {
        niche: safeNiche,
        offer: safeOffer,
        source: "leadflow_feed"
      }
    };
  });
}
