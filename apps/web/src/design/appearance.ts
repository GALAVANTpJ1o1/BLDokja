import type { Colourway } from "@bld/storage";
import type { InterfaceColours, ThemeName } from "./palette";

export const COLOURWAY_COLOURS: Readonly<Record<Colourway, Readonly<Record<ThemeName, InterfaceColours & { readonly accent: string }>>>> = {
  slate: { light: { ground: "#EEF1F2", stage: "#DFE7EB", text: "#223744", textQuiet: "#516673", rule: "#A9B9C1", focus: "#223744", accent: "#346577" }, dark: { ground: "#213640", stage: "#29434D", text: "#F0F5F7", textQuiet: "#B1C7D0", rule: "#567582", focus: "#F0F5F7", accent: "#94D8DB" } },
  jade: { light: { ground: "#E1EEEA", stage: "#CEE3DB", text: "#173D36", textQuiet: "#3C6258", rule: "#789E91", focus: "#173D36", accent: "#17675E" }, dark: { ground: "#0C3035", stage: "#133E42", text: "#EBF5F1", textQuiet: "#AECBC8", rule: "#466D6F", focus: "#EBF5F1", accent: "#8BDACB" } },
  coral: { light: { ground: "#F4E7E5", stage: "#ECD2CE", text: "#512F3C", textQuiet: "#77505F", rule: "#B88791", focus: "#512F3C", accent: "#9B4459" }, dark: { ground: "#493244", stage: "#583E4F", text: "#FFF0E8", textQuiet: "#E2C1C7", rule: "#A97C88", focus: "#FFF0E8", accent: "#EFAAA0" } },
  cotton: { light: { ground: "#EDE8F6", stage: "#DFD5F0", text: "#373150", textQuiet: "#665879", rule: "#A69CBD", focus: "#373150", accent: "#69578B" }, dark: { ground: "#36324E", stage: "#433C5E", text: "#F8EFFB", textQuiet: "#CDC1E0", rule: "#89809F", focus: "#F8EFFB", accent: "#C7AADB" } },
  ocean: { light: { ground: "#E0ECF4", stage: "#CCDFED", text: "#1A3652", textQuiet: "#446079", rule: "#819BB2", focus: "#1A3652", accent: "#285F91" }, dark: { ground: "#24364F", stage: "#2E4460", text: "#EEF5FE", textQuiet: "#BDD0E9", rule: "#7087A2", focus: "#EEF5FE", accent: "#9CC7EE" } },
  forest: { light: { ground: "#E7EDDF", stage: "#D8E2CB", text: "#2D3F30", textQuiet: "#526650", rule: "#879C79", focus: "#2D3F30", accent: "#476A4C" }, dark: { ground: "#2E3F37", stage: "#394E43", text: "#F2F4E8", textQuiet: "#C4D1BC", rule: "#80957A", focus: "#F2F4E8", accent: "#BAD0A8" } },
};
