export function calculateLeadScore({ status, customFields, timelineCount }) {
  let score = 0;

  const normalizedStatus = String(status || "").toUpperCase();
  if (normalizedStatus === "NEW") {
    score += 10;
  }
  if (normalizedStatus === "CONTACTED") {
    score += 25;
  }
  if (normalizedStatus === "QUALIFIED") {
    score += 40;
  }
  if (normalizedStatus === "CUSTOMER") {
    score += 70;
  }

  if (customFields && typeof customFields === "object") {
    const keys = Object.keys(customFields);
    score += Math.min(keys.length * 4, 20);
  }

  if (typeof timelineCount === "number") {
    score += Math.min(timelineCount * 2, 20);
  }

  return Math.min(score, 100);
}
