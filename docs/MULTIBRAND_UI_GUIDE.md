# Multi-Brand UI Guide

This guide ensures that visual changes scale safely across both platforms: AtlasGR and Total Trac.

## The `data-brand` Selector

The application utilizes a `BrandProvider` which monitors the active brand (`atlasgr` or `totaltrac`). When the brand changes, the `data-brand` attribute is appended to the root `html` element.

```css
:root {
  /* Default: AtlasGR */
  --brand: #FF5618;
  --brand-2: #FF6B10;
}

:root[data-brand="totaltrac"] {
  /* Override: Total Trac */
  --brand: #374898;
  --brand-2: #008FCE;
}
```

## Do's and Don'ts
*   **DO** use Tailwind classes like `bg-brand` and `text-brand-2`.
*   **DON'T** use hard-coded color utilities like `bg-orange-500` or `text-blue-700` for primary brand elements.
*   **DO** test specific contrast edge cases by ensuring text remains visible against the active brand token, especially considering that the Total Trac dark blue requires different contrast math than the Atlas orange.
*   **DON'T** apply `box-shadow` or `drop-shadow` containing explicit RGBA coordinates tied to one brand's color (e.g., `rgba(255, 86, 24, 0.5)`); this was a prominent issue resolved in the v1.2 refactoring.
