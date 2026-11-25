export function buildCanonicalAgreementPayload({
  version,
  parentAgreementId,
  title,
  summary,
  category,
  clientDid,
  freelancerDid,
  startDate,
  deadline,
  durationDays,
  totalCost,
  currency,
  paymentSchedule,
  features,
  milestones,
  clauses,
  amendmentReason,
}) {
  return {
    schema: 'trustwork.digital-agreement.v2',
    version: Number(version),
    parentAgreementId: parentAgreementId || null,
    title: String(title).trim(),
    summary: String(summary || '').trim(),
    category: String(category || 'Software Development').trim(),
    parties: {
      gigProviderDid: clientDid,
      freelancerDid: freelancerDid,
    },
    timeline: {
      startDate,
      deadline,
      durationDays: Number(durationDays),
    },
    compensation: {
      totalCost: Number(totalCost),
      currency: currency || 'INR',
      paymentSchedule: paymentSchedule || 'Milestone-Based',
    },
    features: (features || []).map((f, i) => ({
      index: i + 1,
      name: String(f.name).trim(),
      description: String(f.description || '').trim(),
      acceptanceCriteria: String(f.acceptanceCriteria || 'Meets agreed specification').trim(),
    })),
    milestones: (milestones || []).map((m, i) => ({
      index: i + 1,
      title: String(m.title).trim(),
      deliverables: String(m.deliverables).trim(),
      dueDate: String(m.dueDate),
      amount: Number(m.amount),
    })),
    clauses: {
      ipTransfer:
        clauses?.ipTransfer ||
        'Intellectual property rights transfer to the Gig Provider upon milestone approval.',
      confidentiality:
        clauses?.confidentiality ||
        'Both parties agree to maintain confidentiality of source code and business information.',
      governance:
        'Dual-Signature Lock: Neither party may unilaterally modify timeline, compensation, or agreed features. Any change requires cryptographic signatures from both parties, creating a new linked agreement version on-chain.',
    },
    amendmentReason: amendmentReason || '',
  };
}
