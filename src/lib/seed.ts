// Sample meetings kept for reviewers: they can't be deleted and carry their source credit.
export interface SeedInfo {
  label: string;
  credit: string;
  url: string;
}

export const SEEDED: Record<string, SeedInfo> = {
  // 87-minute, 5-person research group meeting: the long, many-speaker case.
  "97d3ca41-6575-49e7-8acc-76738d8e048f": {
    label: "Sample",
    credit: "AMI Meeting Corpus EN2001a · CC BY 4.0",
    url: "https://groups.inf.ed.ac.uk/ami/corpus/",
  },
};

export const seedInfo = (id: string): SeedInfo | null => SEEDED[id] ?? null;
