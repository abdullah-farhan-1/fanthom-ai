// Summary templates, like Fathom's. Each one tells the model which sections to write.
export const TEMPLATES = {
  general: {
    label: "General",
    sections: ["Meeting purpose", "Key takeaways", "Topics discussed", "Next steps"],
    guidance: "A neutral summary for anyone who missed the meeting.",
  },
  sales: {
    label: "Sales call",
    sections: ["Prospect and context", "Pain points", "Budget and timeline", "Objections", "Next steps"],
    guidance: "Written for a sales rep updating a CRM. Use BANT-style facts only if they were said.",
  },
  one_on_one: {
    label: "1:1",
    sections: ["Wins", "Challenges", "Feedback given", "Growth and goals", "Follow-ups"],
    guidance: "Written for a manager and report reviewing their 1:1.",
  },
  standup: {
    label: "Stand-up",
    sections: ["Done", "Doing next", "Blockers"],
    guidance: "Group by person where possible. Very short bullets.",
  },
  user_interview: {
    label: "User interview",
    sections: ["Participant", "Goals and context", "Pain points", "Notable quotes", "Opportunities"],
    guidance: "Written for a product researcher. Prefer the participant's own words.",
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

export function isTemplate(key: string): key is TemplateKey {
  return key in TEMPLATES;
}
