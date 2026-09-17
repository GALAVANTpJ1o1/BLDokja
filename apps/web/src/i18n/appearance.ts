export const appearance = {
  colourway: "Colour theme", colourwayHint: "Choose a palette for the room around your cube. Light and dark versions work independently of sticker colours.",
  colourways: { slate: "Slate studio", jade: "Jade lagoon", coral: "Coral dusk", cotton: "Cotton skies", ocean: "Ocean blue", forest: "Forest moss" },
  environment: "Scenery", environmentHint: "Scroll to move through layered scenery. Navigation briefly carries you forward. No constant animation; reduced-motion keeps the scene still.",
  environments: { none: "Still studio", galaxy: "Galaxy", rain: "Rain", snow: "Snow", forest: "Forest", ocean: "Ocean" },
  density: "Page layout", densities: { comfortable: "Comfortable", compact: "Compact" }, densityHint: "Compact narrows the workbench and reduces spacing, not buttons or sticker targets.",
  selected: "Selected", saveError: "The appearance could not be saved. Your previous choice is unchanged; try again.", saving: "Saving appearance…", saved: "Appearance saved on this device.",
} as const;
