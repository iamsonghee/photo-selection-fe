# Benefits scroll prototype

The previous two-column benefits layout is replaced by `BenefitsScroll`.
Three cards with lightweight, code-rendered sample visuals describe AI selection assistance, original delivery, and selection deadlines/progress.
AI assistance covers similar-photo grouping and eyes-closed/blur filters; final decisions remain with the user.
Customer benefit links and the upcoming Alimtalk notice were removed from this section.
Photo-request matching is explained in the existing results section instead. Similar-photo grouping has no beta label.

`benefits-scroll.css` enables the stack at min-width 801px and min-height 640px,
unless reduced motion is requested. A 580px sticky stage (defined in benefits-scroll.css) occupies a 180vh section.
Passive scrolling schedules a requestAnimationFrame update of card position, scale,
opacity and the 01/03 progress indicator. No wheel interception or forced scrolling.

Mobile and short viewports use a vertical list with a subtle entrance effect.
Reduced motion and the pre-JavaScript layout show all cards statically.
Viewport and motion preference changes are handled without reloading.

Verified desktop start/middle/end, mobile layout, reduced-motion visibility,
absence of horizontal overflow, TypeScript and targeted ESLint.
Screenshots: `docs/assets/benefits-scroll/`.

Documentation impact:
- architecture.md: not affected (presentation only)
- upload-flow.md: not affected
- user-flow.md: its earlier two-column benefits prototype is superseded by this document;
  actual service and selection/review flows are unchanged.
- benefits-scroll.md: updated


## Card visuals
`BenefitVisual.tsx` adds static explanatory UI to each scrolling card:
- AI: local sample photos 01/02 grouped for comparison, photo 03 for eyes-closed checking, and quality-filter labels.
- Original delivery: uploaded files → shared link → customer download.
- Deadline: a fictional September 18 deadline, D−3, and 3/4 selection progress.

These are labeled samples, not live controls or actual AI analysis results.
Images reuse `SamplePhoto`; no API calls, dependencies, generated videos, or operational data are added.
Desktop cards reserve 540px; mobile cards have natural height. Reduced motion keeps the existing static list.

The AI card also uses the user-provided `흔들린사진_01.jpg`, copied unchanged to `public/landing/sample-project/quality/motion-blur-01.jpg`. Below 600px the similar pair occupies the first row and eyes-closed/blur samples share the second row. No synthetic blur or analysis API is applied.
