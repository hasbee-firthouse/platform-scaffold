import { z } from 'zod';

/** The three shipped product profiles (SPEC §7.1). */
export const profileNameSchema = z.enum(['b2c-simple', 'b2b-standard', 'b2b-enterprise']);
export type ProfileName = z.infer<typeof profileNameSchema>;

/**
 * Capability flags. A profile sets defaults for these; an explicit override in
 * `product.config.ts` wins over the profile preset (SPEC §7.1).
 */
export const capabilitiesSchema = z.object({
  personalAccounts: z.boolean(),
  organizations: z.boolean(),
  magicLink: z.boolean(),
  enterpriseEntitlements: z.boolean(),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex color (e.g. #4f46e5)');

export const brandingSchema = z.object({
  productName: z.string().min(1),
  logo: z.object({ light: z.string().min(1), dark: z.string().min(1) }),
  favicon: z.string().min(1),
  colors: z.object({
    primary: hexColorSchema,
    secondary: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
    destructive: hexColorSchema.optional(),
    background: hexColorSchema.optional(),
    foreground: hexColorSchema.optional(),
    muted: hexColorSchema.optional(),
    border: hexColorSchema.optional(),
  }),
  typography: z.object({
    fontFamily: z.string().min(1),
    headingFamily: z.string().min(1).optional(),
  }),
  radius: z.string().min(1),
  /**
   * Optional support/contact destination for the upgrade-notice CTA and other
   * "contact us" surfaces (E7-S1 · AC4). When set it takes precedence over the
   * `mailto:` fallback to `email.fromAddress`. Optional so existing product
   * configs stay valid without change.
   */
  supportUrl: z.string().url().optional(),
});
export type Branding = z.infer<typeof brandingSchema>;

const termSchema = z.object({ singular: z.string().min(1), plural: z.string().min(1) });
export const terminologySchema = z.record(termSchema);
export type Terminology = z.infer<typeof terminologySchema>;

export const navigationSchema = z.object({
  order: z.array(z.string()).optional(),
  hidden: z.array(z.string()).optional(),
});
export type Navigation = z.infer<typeof navigationSchema>;

export const emailIdentitySchema = z.object({
  fromName: z.string().min(1),
  fromAddress: z.string().email(),
});
export type EmailIdentity = z.infer<typeof emailIdentitySchema>;

/**
 * Org typing — a control-plane knob (see `docs/DECISION-framework-control-plane.md`,
 * Gap 3). Generalizes the built-in `organization.type` (`personal|team`) into
 * product-declared types, each mapping to the module nav it shows and the module
 * roles offered on its Members screen. Optional: products that do not use org
 * typing omit the whole `orgTypes` block and nothing changes.
 */
export const orgTypeSchema = z.object({
  /** Module nav ids shown to an org of this type. */
  nav: z.array(z.string()).optional(),
  /** Module role names offered when inviting/assigning within an org of this type. */
  roles: z.array(z.string()).optional(),
});
export type OrgType = z.infer<typeof orgTypeSchema>;

/** A product's declared org types, keyed by type name (e.g. `writer`, `reader`). */
export const orgTypesSchema = z.record(orgTypeSchema);
export type OrgTypes = z.infer<typeof orgTypesSchema>;

/**
 * The shape a product author writes. `capabilities` and `terminology` are
 * optional here: the profile and built-in defaults fill the gaps during
 * resolution in {@link defineProduct}.
 */
export const productInputSchema = z.object({
  name: z.string().min(1),
  profile: profileNameSchema,
  capabilities: capabilitiesSchema.partial().optional(),
  branding: brandingSchema,
  terminology: terminologySchema.optional(),
  navigation: navigationSchema.optional(),
  orgTypes: orgTypesSchema.optional(),
  email: emailIdentitySchema,
});
export type ProductInput = z.input<typeof productInputSchema>;

/** The fully resolved product: capabilities and terminology are always present. */
export const productConfigSchema = productInputSchema.extend({
  capabilities: capabilitiesSchema,
  terminology: terminologySchema,
});
export type ProductConfig = z.infer<typeof productConfigSchema>;
