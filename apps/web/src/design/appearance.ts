import type { Colourway } from "@bld/storage";
import type { InterfaceColours, ThemeName } from "./palette";

export const COLOURWAY_COLOURS: Readonly<Record<Colourway, Readonly<Record<ThemeName, InterfaceColours & { readonly accent: string }>>>> = {
  slate: { light: { ground: "#E8E7EF", stage: "#DCDAE6", text: "#23253A", textQuiet: "#4E5068", rule: "#A9A7BA", focus: "#23253A", accent: "#615584" }, dark: { ground: "#2C2F45", stage: "#34374F", text: "#EFE9E1", textQuiet: "#B9B6C4", rule: "#4F5474", focus: "#EFE9E1", accent: "#C4B7E2" } },
  jade: { light: { ground: "#E1EEEA", stage: "#CEE3DB", text: "#173D36", textQuiet: "#3C6258", rule: "#789E91", focus: "#173D36", accent: "#17675E" }, dark: { ground: "#173B3D", stage: "#21494A", text: "#EFF7F3", textQuiet: "#B5D3CB", rule: "#628B80", focus: "#EFF7F3", accent: "#9AD8C7" } },
  coral: { light: { ground: "#F4E7E5", stage: "#ECD2CE", text: "#512F3C", textQuiet: "#77505F", rule: "#B88791", focus: "#512F3C", accent: "#9B4459" }, dark: { ground: "#493244", stage: "#583E4F", text: "#FFF0E8", textQuiet: "#E2C1C7", rule: "#A97C88", focus: "#FFF0E8", accent: "#EFAAA0" } },
  cotton: { light: { ground: "#EDE8F6", stage: "#DFD5F0", text: "#373150", textQuiet: "#665879", rule: "#A69CBD", focus: "#373150", accent: "#69578B" }, dark: { ground: "#36324E", stage: "#433C5E", text: "#F8EFFB", textQuiet: "#CDC1E0", rule: "#89809F", focus: "#F8EFFB", accent: "#C7AADB" } },
  ocean: { light: { ground: "#E0ECF4", stage: "#CCDFED", text: "#1A3652", textQuiet: "#446079", rule: "#819BB2", focus: "#1A3652", accent: "#285F91" }, dark: { ground: "#24364F", stage: "#2E4460", text: "#EEF5FE", textQuiet: "#BDD0E9", rule: "#7087A2", focus: "#EEF5FE", accent: "#9CC7EE" } },
  forest: { light: { ground: "#E7EDDF", stage: "#D8E2CB", text: "#2D3F30", textQuiet: "#526650", rule: "#879C79", focus: "#2D3F30", accent: "#476A4C" }, dark: { ground: "#2E3F37", stage: "#394E43", text: "#F2F4E8", textQuiet: "#C4D1BC", rule: "#80957A", focus: "#F2F4E8", accent: "#BAD0A8" } },
};
