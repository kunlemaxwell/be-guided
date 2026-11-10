import { z } from 'zod';
import { DENSITIES, LAYOUT_IDS, NAV_POSITIONS, STEP_STYLES, TOC_POSITIONS, WIDTHS } from '../lib/layouts';

/**
 * Content contracts. Every file under `content/` is validated against these
 * schemas at build time, so a bad edit fails the build with a clear message
 * instead of shipping a broken page.
 */

export const THEME_IDS = ['classic', 'ink', 'warm', 'enterprise', 'aurora'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const VIDEO_DISPLAYS = ['collapsed', 'expanded'] as const;

/** Home page hero: one product's screens, a slideshow of products, or a 3D cube that keeps turning. */
export const HERO_ANIMATIONS = ['static', 'slideshow', '3d'] as const;
export type HeroAnimation = (typeof HERO_ANIMATIONS)[number];

export const heroSettingsSchema = z.object({
  animation: z.enum(HERO_ANIMATIONS).default('3d'),
  /** Which products appear, in this order (web address names). Empty = every product on the site. Static uses the first. */
  products: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(12).default([]),
  /** Slideshow: seconds each product stays at the front. 3D: seconds per quarter turn. */
  seconds: z.number().min(2).max(30).default(5),
});
export type HeroSettings = z.infer<typeof heroSettingsSchema>;
export type VideoDisplay = (typeof VIDEO_DISPLAYS)[number];

/**
 * What a content update or a new page may produce. Videos are always real
 * click-throughs of the running app, never slideshows of screenshots.
 */
export const CONTENT_MODES = ['text', 'text+screens', 'video', 'all'] as const;
export type ContentMode = (typeof CONTENT_MODES)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour written like #1D4ED8');

/** Colours the theme customizer can override, for light and for dark mode. */
export const THEME_COLOR_KEYS = ['background', 'surface', 'text', 'muted', 'line', 'accent', 'headerBackground', 'headerText'] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
const paletteSchema = z.object(Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, hexColor.optional()])) as Record<ThemeColorKey, z.ZodOptional<typeof hexColor>>);

/** Typefaces the customizer offers (all on Google Fonts). */
export const FONT_CHOICES = [
  'Plus Jakarta Sans', 'Geist', 'Figtree', 'IBM Plex Sans', 'Inter', 'Roboto', 'Lato', 'Source Sans 3', 'Poppins', 'Nunito Sans', 'Merriweather', 'Lora',
] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

export const SHADOW_LEVELS = ['none', 'subtle', 'soft', 'medium', 'strong'] as const;
export type ShadowLevel = (typeof SHADOW_LEVELS)[number];

/**
 * Owner's adjustments on top of the chosen theme. Every field is optional:
 * anything left out keeps the theme's own value.
 */
export const themeCustomSchema = z.object({
  colors: z.object({ light: paletteSchema.optional(), dark: paletteSchema.optional() }).optional(),
  fontBody: z.enum(FONT_CHOICES).optional(),
  fontHeading: z.enum(FONT_CHOICES).optional(),
  /** Body text size in px. */
  baseSize: z.number().min(13).max(20).optional(),
  /** Heading sizes in px: h1 page title, h2 sections, h3 sub-sections, h4 step titles. */
  headingSizes: z
    .object({ h1: z.number().min(20).max(64).optional(), h2: z.number().min(16).max(48).optional(), h3: z.number().min(14).max(36).optional(), h4: z.number().min(13).max(28).optional() })
    .optional(),
  headingWeight: z.number().int().min(400).max(900).optional(),
  /** Thickness of lines and borders in px. */
  lineWidth: z.number().min(0).max(4).optional(),
  /** Corner rounding (bevels) in px. */
  radius: z.number().min(0).max(28).optional(),
  shadow: z.enum(SHADOW_LEVELS).optional(),
});
export type ThemeCustom = z.infer<typeof themeCustomSchema>;

/** Page layout (Settings › Layout): a preset plus the owner's changes to its options. See src/lib/layouts.ts. */
export const layoutSettingsSchema = z.object({
  id: z.enum(LAYOUT_IDS).default('standard'),
  nav: z.enum(NAV_POSITIONS).optional(),
  toc: z.enum(TOC_POSITIONS).optional(),
  width: z.enum(WIDTHS).optional(),
  density: z.enum(DENSITIES).optional(),
  steps: z.enum(STEP_STYLES).optional(),
});
export type LayoutSettings = z.infer<typeof layoutSettingsSchema>;

export const siteSettingsSchema = z.object({
  siteName: z.string().min(1),
  /** Site-wide theme, chosen in the admin app's theme selector. */
  theme: z.enum(THEME_IDS),
  /** What readers see before they pick light or dark themselves. */
  defaultMode: z.enum(['light', 'dark', 'system']).default('system'),
  supportUrl: z.string().url().optional(),
  /**
   * How walkthrough videos appear on a page: "collapsed" shows one slim
   * "Watch the … walkthrough" row that opens the player when clicked;
   * "expanded" shows the player straight away. A page can override it.
   */
  video: z.object({ display: z.enum(VIDEO_DISPLAYS).default('collapsed') }).default({ display: 'collapsed' }),
  /** Customizer adjustments on top of `theme`. */
  themeCustom: themeCustomSchema.optional(),
  /** The picture on the home page (Settings › Home page). */
  hero: heroSettingsSchema.default({ animation: '3d', products: [], seconds: 5 }),
  /** How guide pages are arranged; independent of the theme. */
  layout: layoutSettingsSchema.default({ id: 'standard' }),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

const environmentSchema = z.object({
  /** Address of the running application, used for screenshots. */
  appUrl: z.string().url(),
});

export const productSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  /** Private products are left out of public builds, search, API and AI. */
  visibility: z.enum(['public', 'private']),
  status: z.enum(['available', 'coming-soon']).default('available'),
  order: z.number().int().default(100),
  /**
   * Changes sent through the editor connector (Claude Code / Codex) wait for
   * an owner's approval in the admin when true; when false they go live at once.
   */
  editorApproval: z.boolean().default(true),
  /** Optional per-product theme; falls back to the site theme. */
  theme: z.enum(THEME_IDS).optional(),
  /**
   * Hero pictures for this product's landing page and its home-page slide:
   * screenshots inside the product, e.g. "sales/images/invoice-list.webp"
   * (module/images/file). Left out: the first screenshots of its guides.
   */
  hero: z.object({ images: z.array(z.string().regex(/^[a-z0-9-]+\/(images)\/[A-Za-z0-9._-]+$/)).max(4), label: z.string().max(60).optional() }).optional(),
  source: z
    .object({
      repos: z.array(
        z.object({
          url: z.string().min(1),
          branch: z.string().default('main'),
          /** Folders inside the repo that hold the screens, e.g. src/app */
          paths: z.array(z.string()).default([]),
          /** Where the repo's code is on the owner's Mac, if it has been chosen. */
          localPath: z.string().optional(),
        }),
      ),
    })
    .default({ repos: [] }),
  environments: z
    .object({
      local: environmentSchema.optional(),
      staging: environmentSchema.optional(),
      production: environmentSchema.optional(),
    })
    .default({}),
});
export type ProductMeta = z.infer<typeof productSchema>;

export const MODULE_GROUPS = ['start', 'run', 'approve', 'administer'] as const;
export type ModuleGroup = (typeof MODULE_GROUPS)[number];

export const moduleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  group: z.enum(MODULE_GROUPS).default('run'),
  order: z.number().int().default(100),
  /**
   * Business area this module belongs to, e.g. "HR". Modules that share an
   * area are shown together on one area overview page (all roles, all sections).
   */
  area: z.string().trim().min(1).max(40).optional(),
});
export type ModuleMeta = z.infer<typeof moduleSchema>;

/** YAML turns 2026-11-03 into a Date; accept either and keep YYYY-MM-DD. */
const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date written YYYY-MM-DD'),
);

export const pageFrontmatterSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  audience: z.string().optional(),
  /** ISO date of the last meaningful change. */
  updated: isoDate,
  status: z.enum(['published', 'draft']).default('published'),
  /**
   * "public" pages are on the public site; "private" pages are kept out of
   * every public build (like a private product) but stay editable in the admin.
   */
  visibility: z.enum(['public', 'private']).default('public'),
  /**
   * Who wrote it: a person's name from the admin's People list. The older
   * values "claude" and "human" are still read (shown as "Claude" / "Not set").
   */
  author: z.string().trim().min(1).max(120).default('human'),
  order: z.number().int().default(100),
  /**
   * Heading this page is listed under inside its module (e.g. "Leave",
   * "Expenses"). Sections appear in the order of their first page.
   */
  section: z.string().trim().min(1).max(60).optional(),
  /**
   * What kind of page this is, for the Configuration center. Usually worked out
   * from the address (set-up-… = setup); set it when that guess is wrong.
   */
  kind: z.enum(['setup', 'task', 'overview', 'reference']).optional(),
  /** App screens this page explains, e.g. /sales/invoices/new */
  appRoutes: z.array(z.string()).default([]),
  /**
   * Setup the reader must finish first. Each entry is a guide reference:
   * "module/page" (same product) or "product/module/page".
   */
  prerequisites: z.array(z.object({ page: z.string(), why: z.string().optional() })).default([]),
  video: z
    .object({
      src: z.string(),
      poster: z.string().optional(),
      length: z.string().optional(),
      /** Overrides the site's video display for this page only. */
      display: z.enum(VIDEO_DISPLAYS).optional(),
    })
    .optional(),
  /** Set when a release changed this page; shows the "Changed" label. */
  changed: z.object({ date: isoDate, note: z.string() }).optional(),
});
export type PageFrontmatter = z.infer<typeof pageFrontmatterSchema>;

export interface Product extends ProductMeta {
  slug: string;
  modules: Module[];
}

export interface Module extends ModuleMeta {
  slug: string;
  productSlug: string;
  pages: GuidePage[];
}

export interface GuidePage extends PageFrontmatter {
  /** product/module/page */
  id: string;
  slug: string;
  moduleSlug: string;
  productSlug: string;
  /** Markdown body (with guide: links and ::: blocks). */
  body: string;
  /** Section headings, for "On this page". */
  headings: { id: string; text: string }[];
}

export interface ResolvedLink {
  id: string;
  href: string;
  title: string;
  summary: string;
}
