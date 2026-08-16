# AtlasGR & Total Trac Multi-Brand Design System

This design system defines the foundation for the B2B Revenue Operating System. It relies heavily on Semantic Tokens mapped via `activeBrand` logic to construct a unified "Command Center" aesthetic that naturally adapts to either brand identity.

## Principles
1.  **Executive Transparency**: High data density managed through clear hierarchy and ample structural padding, eschewing excessive drop shadows for modern glassmorphism (backdrop blurs with structural 1px borders).
2.  **Multi-brand Flexibility**: A strict usage of generic CSS custom properties (`--brand`, `--brand-2`, `--bg`, `--surface`) ensures the same components can seamlessly morph from the bright energy of AtlasGR to the stable depth of Total Trac.
3.  **Shapes & Geometry**: Using consistent 8px radiuses (`rounded-lg`) for primary interactive controls (Buttons, Inputs, Badges) and 16px radiuses (`rounded-2xl`) for larger layout containers (Cards, Modals).

## Color Strategy
*   **AtlasGR**: Primarily driven by `--brand: #FF5618` and `--brand-2: #FF6B10` built against warm-cool neutrals (`--bg: #F8F9FA`).
*   **Total Trac**: Primarily driven by `--brand: #374898` and `--brand-2: #008FCE`, utilizing the same core backgrounds to achieve a robust corporate stability.
*   **Semantic Layer**: Usage of `--color-ok` (success), `--color-warn` (warning), `--color-danger-base` (error), and `--color-info-base` (information) applied across the badge component.

## Component Implementation
*   **Button**: Gradient overrides were replaced with solid brand colors, focusing on hover interactions that alter brightness rather than hardcoding Atlas-specific gradients.
*   **Card**: Elevated structures now rely on `--surface-elevated` along with subtle translucent borders (`border-t-white/40 border-b-black/5`) to generate depth.
*   **Layout**: The application canvas shifted from decorative glowing orbs to a minimalist `bg-bg`, keeping the focus strictly on data and operations.
