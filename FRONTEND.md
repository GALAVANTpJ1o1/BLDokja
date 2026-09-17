# Complete Frontend, UI, UX, and Motion Redesign

Continue working on this existing project. You already built most of it, so use your existing understanding of the repository and inspect only what is necessary before editing. Do not spend context re-explaining the entire codebase.

Your task is to completely redesign the frontend, UI system, UX, responsive behavior, interaction design, and motion system while preserving the application's working behavior.

Do not stop after a plan. Implement the redesign, run the application, inspect it visually, test it, refine it, and complete the work.

## Use the installed tools intentionally

Use the installed plugins and skills where they are useful:

- **Build Web Apps** for the primary frontend implementation, component architecture, responsive work, and browser-oriented development.
- **Frontend Design Premium** for a production-quality design system and polished implementation.
- **Taste** to establish a distinctive visual direction and prevent a generic AI-generated look.
- **MotionDesign** for the motion language, microinteractions, transitions, and signature 3D cube.
- **BrowserAct** to run and interact with the real site at desktop and mobile sizes.
- **UXCritique** after the first complete visual implementation, followed by fixes for legitimate findings.
- **Review** for the final regression, accessibility, performance, and code-quality pass.
- **Context7** whenever current documentation or version-specific APIs are uncertain.
- **Figma** only if it provides a clear advantage; do not make it a dependency.
- **GitHub** only when repository history or change context is useful.

Do not invoke every plugin merely because it is installed. Use each specialist at the appropriate stage.

## Compatibility contract

The current working functionality is a compatibility contract.

You may aggressively replace or reorganize:

- styling and design tokens
- layout and navigation presentation
- presentational components
- visual frontend architecture
- typography, spacing, color, surfaces, and iconography
- responsive behavior
- motion and interaction presentation

Preserve unless a genuine bug requires a change:

- features and business logic
- routes and important URLs
- APIs and payload shapes
- authentication and authorization
- stored data and persistence
- cube algorithms and calculations
- forms and validation
- state transitions and user flows
- backend behavior and external integrations

Do not rewrite working logic simply because redesigning the UI makes that convenient. If logic and presentation are tangled, extract and reuse the logic carefully.

Do not overwrite unrelated uncommitted user work.

## Design direction

This is not a minor polish pass. Make the application feel like a distinctive, premium, modern cubing-learning and practice product with its own visual identity.

Avoid the usual generic AI/SaaS appearance:

- endless identical rounded cards
- bento grids everywhere
- random purple/blue gradients
- excessive glassmorphism, pills, blur, glow, and shadows
- giant unused hero areas
- decorative floating blobs
- everything boxed into a container
- weak default typography

Use **Build Web Apps**, **Frontend Design Premium**, and **Taste** to choose one coherent visual direction appropriate to cubing, learning, algorithms, speed, spatial reasoning, and practice. The interface should feel designed as one product, not assembled from unrelated components.

Create a maintainable design system using reusable tokens and primitives for:

- color and semantic state colors
- typography scale, weights, tracking, line heights, and reading widths
- spacing and layout grid
- container widths and responsive breakpoints
- surfaces, borders, radii, elevation, and shadows
- iconography
- buttons, links, controls, forms, navigation, tabs, menus, dialogs, drawers, tooltips, tables/lists, and feedback states
- hover, focus, pressed, selected, disabled, loading, empty, success, and error states
- motion durations, easings, springs, and stagger rules

Use CSS variables or equivalent design tokens instead of arbitrary one-off values. Abstract patterns that genuinely repeat, but do not force every unique surface into a generic card component.

Typography and information hierarchy must be deliberate. Primary actions and current location should be obvious; secondary controls should remain secondary. Preserve product meaning and data when improving small labels.

## Signature interactive 3×3 cube

Add a small, high-quality interactive 3D 3×3 cube on the left side of the main navigation/header, beside the product name. It should be a subtle signature element, not a distracting toy.

### Required behavior

- It starts solved when the application opens.
- Meaningful interactions—such as entering Practice, changing major sections, opening learning areas, or clicking the cube—can trigger a transition to another recognizable pattern.
- Include patterns such as cube-in-a-cube, superflip, snake, donut or a valid close equivalent, and other interesting legal 3×3 patterns.
- The cube must execute real legal moves using correct cube notation and state modelling.
- Never fake a transition by crossfading or directly replacing sticker colors.
- A transition must begin from the cube's current logical state. For known patterns, a guaranteed valid route may use `inverse(currentPatternAlgorithm) + targetPatternAlgorithm`; optimize redundant moves if useful.
- Keep the logical cube state separate from rendering so every visible move updates the same authoritative state.
- Turns must be readable and physically convincing: move → move → move → completed pattern.
- Hover may produce a restrained orientation/tilt response. Route changes and selected primary actions may trigger pattern changes when appropriate.
- Navigation must never wait for the cube animation.
- Handle rapid interactions safely by queueing, cancelling, or retargeting animations without corrupting state.
- Pause unnecessary rendering when hidden or offscreen.
- On mobile, retain a clean simplified version when space permits; reduce or hide it only when necessary.
- Respect `prefers-reduced-motion`; provide a static or substantially simplified alternative while preserving understandable state.

Use **MotionDesign** specifically to refine its timing, easing, continuity, interruption behavior, and physicality. It should feel like a real puzzle being manipulated, not independent CSS pieces rotating.

## Interaction and motion system

Add substantially more thoughtful interaction detail, but do not animate everything merely because it can move.

Create a coherent hierarchy:

- fast feedback for hover, press, focus, and selection
- standard transitions for menus, tabs, accordions, filters, and controls
- larger enter/exit motion for pages, dialogs, drawers, and important state changes
- rare expressive moments for features that deserve emphasis

Improve where appropriate:

- button and navigation feedback
- active navigation indicators
- tab and accordion transitions
- dropdown, popover, tooltip, modal, and drawer motion
- input focus and validation feedback
- checkbox, switch, selection, and filter feedback
- list insertion/removal and filtered-result transitions
- loading and skeleton-to-content transitions
- algorithm selection and animated cube-preview controls
- success, error, toast, and empty-state feedback
- subtle icon motion and scroll reveals
- route/section transitions that improve continuity

Motion must communicate causality and remain responsive. Prefer transform and opacity, avoid layout thrashing and constant animation, and keep ordinary interactions fast. Do not introduce multiple competing motion libraries. Use Context7 before adding or changing a library when compatibility is uncertain.

Animations must never be necessary to understand state.

## Responsive design and accessibility

Design intentionally for large desktop, laptop, tablet, and mobile. Do not merely shrink the desktop layout.

Reconsider hierarchy, density, navigation, sidebars, tables, filters, dialogs, forms, and toolbars at smaller breakpoints. Avoid horizontal overflow and provide appropriate touch targets.

Maintain or improve:

- semantic HTML
- keyboard operation and sensible tab order
- visible, consistent focus treatment
- accessible labels and control semantics
- sufficient contrast
- usable touch targets
- accessible menus, forms, dialogs, and interactive cube controls
- reduced-motion support

Use ARIA only where native semantics are insufficient. Do not replace accessible native controls with decorative div-based imitations.

## Performance and implementation quality

The interface should feel expensive, not computationally expensive.

Avoid unnecessary rerenders, always-running animations, layout thrashing, oversized visual dependencies, huge blur regions, gratuitous scroll listeners, and JavaScript where CSS is sufficient. Lazy-load genuinely expensive visual features where appropriate.

Do not solve the redesign with one enormous component or stylesheet. Keep component ownership clear, preserve type safety, follow useful repository conventions, and remove obsolete styling so two design systems do not remain in competition.

Use a single consistent icon family unless an existing brand asset requires otherwise. Do not use text glyphs as UI icons.

Do not invent fake analytics, testimonials, activity, AI features, placeholder dashboards, or unrelated product functionality to make screenshots look impressive.

## Mandatory visual QA and refinement

After the first implementation, use **BrowserAct** or the available browser-testing workflow to run the real application and inspect every important page and flow at desktop and mobile sizes.

Interact with relevant navigation, learning pages, practice areas, algorithm views, filters/search, tabs, forms, menus, dialogs, drawers, animated cube previews, and the signature navigation cube. Check browser console errors, clipping, overflow, loading/error/empty/success states, and rapid-interaction behavior.

Use **UXCritique** and be critical about:

- information hierarchy and navigation clarity
- typography, spacing, alignment, density, and contrast
- visual and component consistency
- overuse of cards or containers
- learning-flow clarity and algorithm discoverability
- animation quality, restraint, and physicality
- mobile adaptation and touch usability
- accessibility and reduced-motion behavior

Implement fixes for legitimate findings. If the result still looks generic, inconsistent, unfinished, or template-like, use **Taste** and **Frontend Design Premium** again and continue refining it. Compiling is not the completion standard.

## Final regression pass

Use **Review** for a final regression-focused pass. Run the existing build, type checks, linting, and tests where available, then manually verify important journeys that lack automated coverage.

Check especially for:

- behavior broken by the redesign
- route, state, form, or persistence regressions
- cube-state and animation lifecycle bugs
- rapid-interaction race conditions
- console errors or warnings
- accessibility and keyboard regressions
- mobile and responsive problems
- unnecessary rerenders, memory leaks, or performance issues
- dead or duplicate frontend code

Do not perform another broad redesign during this final pass unless a real issue requires it. Do not claim a test or flow was checked unless it actually was.

## Autonomy and completion

Make strong, product-appropriate visual decisions without repeatedly asking minor aesthetic questions. Ask only when a genuine product decision cannot be inferred safely.

The completion bar is a polished, coherent, responsive, accessible, thoroughly tested frontend that could plausibly ship as a professionally designed premium cubing application while retaining all previously working behavior.

When finished, report concisely:

1. the chosen visual direction
2. the major design-system and component changes
3. the interaction/motion system and signature cube implementation
4. responsive and accessibility improvements
5. browser flows, tests, build, type checks, and linting actually performed
6. important existing behaviors verified
7. genuine remaining limitations
