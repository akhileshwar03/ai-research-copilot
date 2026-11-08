export interface Sample {
  id: "ai" | "human";
  label: string;
  text: string;
  /** Where the sample comes from, shown under the text box so nobody mistakes it for something else. */
  source: string;
}

// Two honest samples. The human one is real, public-domain writing; the AI one is a typical AI-written paragraph.
export const SAMPLES: Sample[] = [
  {
    id: "ai",
    label: "AI-written sample",
    source: "Sample: a typical paragraph written by an AI model.",
    text: "Climate change is one of the most pressing challenges facing our planet today. Rising global temperatures are causing glaciers to melt, sea levels to rise, and weather patterns to become increasingly unpredictable. To address this issue, governments, businesses, and individuals must work together to reduce greenhouse gas emissions. Transitioning to renewable energy sources, such as solar and wind power, is a crucial step. By taking collective action, we can build a more sustainable future for generations to come.",
  },
  {
    id: "human",
    label: "Human-written sample",
    source: "Sample: Charles Darwin, On the Origin of Species (1859), the opening of the Introduction. Public domain.",
    text: "When on board HMS Beagle, as naturalist, I was much struck with certain facts in the distribution of the inhabitants of South America, and in the geological relations of the present to the past inhabitants of that continent. These facts seemed to me to throw some light on the origin of species, that mystery of mysteries, as it has been called by one of our greatest philosophers. On my return home, it occurred to me, in 1837, that something might perhaps be made out on this question by patiently accumulating and reflecting on all sorts of facts which could possibly have any bearing on it.",
  },
];
