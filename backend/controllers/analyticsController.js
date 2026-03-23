import { prisma } from "../lib/prisma.js";

export async function getDashboardAnalytics(req, res, next) {
  try {
    const [stages, campaigns, opportunities, activityFeed] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { userId: req.user.id },
        include: { _count: { select: { leads: true } } },
        orderBy: { sortOrder: "asc" }
      }),
      prisma.campaign.findMany({
        where: { userId: req.user.id },
        select: {
          id: true,
          name: true,
          sentCount: true,
          openCount: true,
          clickCount: true,
          attributedAmount: true
        },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      prisma.opportunity.findMany({
        where: { userId: req.user.id },
        select: { id: true, status: true, amount: true, createdAt: true }
      }),
      prisma.activityEvent.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: 30
      })
    ]);

    const funnel = stages.map((stage) => ({
      stageId: stage.id,
      stage: stage.name,
      count: stage._count.leads
    }));

    const campaignPerformance = campaigns.map((campaign) => {
      const openRate = campaign.sentCount > 0 ? Math.round((campaign.openCount / campaign.sentCount) * 100) : 0;
      const clickRate = campaign.sentCount > 0 ? Math.round((campaign.clickCount / campaign.sentCount) * 100) : 0;
      return {
        ...campaign,
        openRate,
        clickRate
      };
    });

    const revenue = opportunities
      .filter((opp) => opp.status === "WON")
      .reduce((sum, opp) => sum + Number(opp.amount || 0), 0);

    return res.json({
      funnel,
      campaignPerformance,
      revenue,
      activityFeed
    });
  } catch (error) {
    return next(error);
  }
}

export async function exportAnalyticsCsv(req, res, next) {
  try {
    const leads = await prisma.lead.findMany({
      where: { userId: req.user.id },
      include: { stage: true },
      orderBy: { createdAt: "desc" }
    });

    const header = "id,name,email,status,score,stage\n";
    const rows = leads
      .map((lead) => {
        const values = [lead.id, lead.name, lead.email, lead.status, String(lead.score), lead.stage?.name || ""];
        return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
      })
      .join("\n");

    res.setHeader("content-type", "text/csv");
    res.setHeader("content-disposition", "attachment; filename=leadflow-analytics.csv");
    return res.send(`${header}${rows}`);
  } catch (error) {
    return next(error);
  }
}
