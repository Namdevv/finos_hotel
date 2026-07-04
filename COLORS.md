# 🎨 Color Palette & Design Tokens — FinOS Hotel

Official frontend color documentation. **All new colors must be taken from here** to maintain a consistent UI.

> **Source of Truth:**
> - Custom `brand` and `ink` colors are defined in [`frontend/tailwind.config.js`](frontend/tailwind.config.js).
> - The `slate`, `emerald`, `rose`, `amber` colors are **Tailwind's default palette** (no need to declare).
> - Want to change the brand tone? Just edit the `brand` scale in `tailwind.config.js` and the whole app updates.
>
> **Font:** `Plus Jakarta Sans` (imported in [`frontend/src/index.css`](frontend/src/index.css)).

---

## 1. Summary by Role (Quick Read)

| Role | Token (Tailwind class) | Hex | Used For |
|---|---|---|---|
| **Brand / Primary Action** | `brand-600` | `#2563eb` | Primary buttons, links, active menu, focus ring |
| **Sidebar / Dark Panel Background** | `ink-900` | `#131a27` | Sidebar, brand panel on login page |
| **Primary Text** | `slate-900` | `#0f172a` | Headings, key figures |
| **Normal Text** | `slate-700` | `#334155` | Table content, paragraphs |
| **Secondary / Dim Text** | `slate-500` | `#64748b` | Descriptions, secondary labels |
| **Very Dim Text** | `slate-400` | `#94a3b8` | Placeholders, small notes |
| **Borders** | `slate-200` | `#e2e8f0` | Card borders, table lines |
| **Page Background** | `slate-100` | `#f1f5f9` | General background |
| **Card / Surface Background** | `white` | `#ffffff` | Cards, tables, inputs |
| **INCOME / Positive** | `emerald-600` | `#059669` | Income amounts, increases, OK status |
| **EXPENSE / Negative / Delete** | `rose-600` | `#e11d48` | Expense amounts, delete buttons, errors |
| **Warning / Needs Review** | `amber-600` | `#d97706` | Low confidence OCR cells |

---

## 2. `brand` — Trusted Blue (Primary Color)

Accounting software style. Defined in `tailwind.config.js`.

| Token | Hex | Typical Usage |
|---|---|---|
| `brand-50`  | `#eff6ff` | Light background (hover row, info banner, avatar background) |
| `brand-100` | `#dbeafe` | Badge background, avatar |
| `brand-200` | `#bfdbfe` | Badge border, light ring |
| `brand-300` | `#93c5fd` | Focus ring |
| `brand-400` | `#60a5fa` | Dropzone border hover |
| `brand-500` | `#3b82f6` | Active ring, secondary accent |
| **`brand-600`** | **`#2563eb`** | **Primary button, active menu, link, logo** |
| `brand-700` | `#1d4ed8` | Primary button hover, text on light background |
| `brand-800` | `#1e40af` | — (fallback) |
| `brand-900` | `#1e3a8a` | — (fallback) |
| `brand-950` | `#172554` | — (fallback) |

## 3. `ink` — Dark Background (Sidebar)

| Token | Hex | Usage |
|---|---|---|
| `ink-800` | `#1b2333` | Secondary dark background layer |
| **`ink-900`** | **`#131a27`** | **Sidebar background, login panel** |
| `ink-950` | `#0c111b` | Deepest dark background |

> On `ink` background: primary text uses `white`, secondary text `slate-300`/`slate-400`, lines `white/10`.

## 4. `slate` — Neutral (Text, Background, Border)

Blue-gray scale used for almost all neutral elements.

| Token | Hex | Usage Layer |
|---|---|---|
| `slate-50`  | `#f8fafc` | Disabled input background, table header |
| `slate-100` | `#f1f5f9` | **Page background**, light hover |
| `slate-200` | `#e2e8f0` | **Border** for cards/tables/inputs |
| `slate-300` | `#cbd5e1` | Input border |
| `slate-400` | `#94a3b8` | Placeholder, dim icon, chart axis |
| `slate-500` | `#64748b` | Secondary text, labels |
| `slate-600` | `#475569` | Darker secondary text |
| `slate-700` | `#334155` | **Body text** |
| `slate-800` | `#1e293b` | Bold text |
| `slate-900` | `#0f172a` | **Headings, figures** |

## 5. Semantic Colors

Fixed conventions across the app — **do not change meanings**:

### 🟢 INCOME / Positive → `emerald`
| Token | Hex | Usage |
|---|---|---|
| `emerald-50`  | `#ecfdf5` | "Income" badge background, KPI icon background |
| `emerald-200` | `#a7f3d0` | Badge border |
| `emerald-600` | `#059669` | **Text/income amount** |
| `emerald-700` | `#047857` | Badge text |

### 🔴 EXPENSE / Negative / Delete / Error → `rose`
| Token | Hex | Usage |
|---|---|---|
| `rose-50`  | `#fff1f2` | "Expense" badge background, delete button hover background, error box background |
| `rose-200` | `#fecdd3` | Badge border / error box |
| `rose-600` | `#e11d48` | **Text/expense amount, delete button, error message** |
| `rose-700` | `#be123c` | Danger button hover |

### 🟡 Warning / Needs Review → `amber`
| Token | Hex | Usage |
|---|---|---|
| `amber-50`  | `#fffbeb` | Warning banner background |
| `amber-200` | `#fde68a` | Banner border |
| `amber-300` | `#fcd34d` | **Ring for low confidence OCR cell** |
| `amber-600` | `#d97706` | Warning text/icon |
| `amber-700` | `#b45309` | Warning banner text |

---

## 6. Chart Colors (Recharts — use hex directly)

See [`frontend/src/pages/Dashboard.tsx`](frontend/src/pages/Dashboard.tsx).

| Purpose | Hex | Note |
|---|---|---|
| **Income** column | `#10b981` | = emerald-500 |
| **Expense** column | `#f43f5e` | = rose-500 |
| Grid lines | `#eef2f7` | very light gray |
| Axis / labels | `#94a3b8` | = slate-400 |

---

## 7. Quick Usage Rules (Cheat-sheet)

```text
Primary button       → bg-brand-600  hover:bg-brand-700  text-white
Secondary button     → bg-white  border-slate-300  text-slate-700  hover:bg-slate-50
Danger button        → bg-rose-600  hover:bg-rose-700  text-white
Input                → border-slate-300  focus:border-brand-500  focus:ring-brand-100   (class .field)
Card                 → bg-white  border-slate-200  shadow-card
Heading              → text-slate-900 font-bold
Secondary text       → text-slate-500
INCOME amount        → text-emerald-600
EXPENSE amount       → text-rose-600
Income/Expense Badge → <Badge color="green | red">  (see components/ui.tsx)
Sidebar              → bg-ink-900  text-slate-300  (item active: bg-brand-600 text-white)
```

> Reusable components are located in [`frontend/src/components/ui.tsx`](frontend/src/components/ui.tsx): `Button`, `Badge`, `Card`, `Input`, `StatTile`, `PageHeader`. **Prioritize using these components instead of combining classes manually** to maintain consistency.

---

## 8. Accessibility

- Text contrast ratio ≥ **4.5:1**: `slate-700`/`slate-900` on white background meets AAA standard.
- **Do not** use body text lighter than `slate-500` on a white background.
- Color **is not** the only indicator: Income/Expense always comes with **text + icon** (up/down arrow), not just relying on green/red — supports color blindness.
- Buttons/inputs all have `focus-visible:ring` for keyboard navigation.

---

## 9. Want to change the brand tone?

1. Open [`frontend/tailwind.config.js`](frontend/tailwind.config.js).
2. Replace the 11 values in `colors.brand` (50 → 950). Suggested scale generator: https://uicolors.app
3. Rerun `npm run build`. All buttons/menus/links will update accordingly — **no need to edit each page**.
4. Update this file to match.
