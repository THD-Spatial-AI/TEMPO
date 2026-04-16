# Design System Specification: The Monolith

## 1. Overview & Creative North Star
**Creative North Star: "The Architectural Blueprint"**
This design system moves away from the "soft" web of rounded corners and playful accents, leaning instead into the rigor of architectural drafting and academic publishing. It is a system of extreme precision, intentionality, and data-density. 

By utilizing a "Hard-Edge" philosophy—where the geometry is unapologetically sharp—we create a visual environment that feels engineered rather than decorated. The goal is to move beyond a simple grayscale UI and into a high-end editorial experience that treats technical data with the reverence of a master-planned blueprint.

## 2. Colors & Surface Philosophy
The palette is a disciplined study in grayscale. We do not use color to draw attention; we use contrast and luminance.

### The Grayscale Core
- **Primary:** `#000000` (The Absolute)
- **On-Primary:** `#E2E2E2`
- **Surface:** `#FAF8FF` (The Paper)
- **Surface-Container-Lowest:** `#FFFFFF`
- **Surface-Container-High:** `#E2E7FF`
- **Outline-Variant:** `#C6C6C6`

### The "No-Line" Rule & Tonal Boundary
To maintain an elite editorial feel, prohibit the use of standard 1px borders for general sectioning. Boundaries must be defined by **background shifts**. 
*   **Implementation:** Place a `surface-container-lowest` (#FFFFFF) data module inside a `surface` (#FAF8FF) page background. The 2% shift in luminance is enough for the eye to perceive a boundary without the "noise" of a line.

### Glassmorphism & Precision
Floating elements (modals, dropdowns) should utilize the **"Technical Frost"** effect. Use a semi-transparent `surface-container-lowest` with a 20px backdrop-blur. This allows data to remain visible underneath, maintaining the "Academic Transparency" of the tool.

## 3. Typography: The Editorial Hierarchy
The system relies on **Inter** for its mathematical precision and neutral character. We use a high-contrast scale to ensure a clear distinction between technical labels and academic headlines.

*   **Display (Large/Medium):** 3.5rem / 2.75rem. Weight: 700. Use for high-impact data summaries or section headers. Letter spacing: -0.02em.
*   **Headline (Small):** 1.5rem. Weight: 600. The primary navigational anchor.
*   **Body (Medium):** 0.875rem. Weight: 400. Line height: 1.6. This generous leading ensures that dense technical text remains legible.
*   **Label (Small):** 0.6875rem. Weight: 700. All-caps for metadata, table headers, and technical constants.

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are forbidden. We communicate depth through **The Layering Principle**.

*   **Stacking Tiers:** Instead of "lifting" an object with a shadow, "sink" the background. Place your active workspace on `surface-container-lowest` and your navigation sidebar on `surface-dim`.
*   **The Ghost Border:** If a visual separator is required for high-density data tables, use the `outline-variant` (#C6C6C6) at **15% opacity**. It should feel like a "pencil mark" rather than a digital line.
*   **Ambient Depth:** When a modal must float, use a shadow with a 40px blur, 0px offset, and 4% opacity of `#000000`. It should be felt, not seen.

## 5. Components

### Buttons (The Tactical Interface)
*   **Primary:** Solid `#000000`, 0px border-radius. Text: `on-primary` (#E2E2E2).
    *   *Hover State:* Invert to `#3B3B3B` with a sharp 2px bottom-stroke of `#000000`.
*   **Secondary:** Outlined `outline` (#777777). 0px border-radius.
    *   *Hover State:* Solid `#FAF8FF` background with a black text shift.

### Input Fields (The Data Entry)
*   **Style:** Minimalist underline or "Ghost Box." 
*   **Rule:** Forbid 4-sided borders on inputs. Use a 1px bottom-border using `outline`. On focus, the border transitions to 2px `#000000`.
*   **Error State:** Use `error` (#BA1A1A) only for the stroke and helper text. The container must remain grayscale to maintain system integrity.

### Cards & Data Modules
*   **Styling:** No borders, 0px corners. 
*   **Spacing:** Use "Extreme Breathing Room." A module containing a data visualization should have a minimum of 32px internal padding to isolate the "Technical Diagram" from the UI chrome.

### Technical Imagery & Icons
*   **Icons:** 1px stroke weight, sharp 90-degree angles. No rounded caps or joins.
*   **Diagrams:** Use `primary-fixed-dim` (#474747) for secondary lines and `primary` (#000000) for the critical path.

## 6. Do's and Don'ts

### Do
*   **Do** use 0px border radius for everything. It is the signature of the system.
*   **Do** use white space as a functional tool to separate complex data sets.
*   **Do** prioritize "Monospaced" stylistic sets for numerical data within the Inter font family.

### Don't
*   **Don't** use drop shadows to indicate hierarchy; use color-value stepping (Tonal Layering).
*   **Don't** use standard 1px `#000000` borders; they are too aggressive. Use the "Ghost Border" at 15% opacity.
*   **Don't** introduce any accent color (blue, green, etc.), even for "Success" states. Use heavy black weights and checkmark icons for success.