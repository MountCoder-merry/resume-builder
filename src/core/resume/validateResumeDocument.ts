import { CURRENT_SCHEMA_VERSION } from "./constants";

export type ValidationError = {
  code: string;
  path: string;
  message: string;
};

export type ValidationWarning = {
  code: string;
  path: string;
  message: string;
};

export type ResumeValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const addError = (errors: ValidationError[], code: string, path: string, message: string): void => {
  errors.push({ code, path, message });
};

const addWarning = (warnings: ValidationWarning[], code: string, path: string, message: string): void => {
  warnings.push({ code, path, message });
};

const validateOrder = (
  order: unknown,
  path: string,
  knownIds: Set<string>,
  errors: ValidationError[],
): void => {
  if (!Array.isArray(order)) {
    addError(errors, "ORDER_INVALID", path, "Order must be an array.");
    return;
  }
  const seen = new Set<string>();
  order.forEach((id, index) => {
    if (!isNonEmptyString(id) || !knownIds.has(id)) {
      addError(errors, "ORDER_REFERENCE_INVALID", `${path}.${index}`, "Order references a missing entry.");
    }
    if (isNonEmptyString(id)) {
      if (seen.has(id)) addError(errors, "ORDER_DUPLICATE", `${path}.${index}`, "Order contains a duplicate entry.");
      seen.add(id);
    }
  });
  for (const id of knownIds) {
    if (!seen.has(id)) addError(errors, "ORDER_ENTRY_MISSING", path, `Entry ${id} is missing from the order.`);
  }
};

const validateMargins = (value: unknown, path: string, errors: ValidationError[]): void => {
  if (!isRecord(value)) {
    addError(errors, "MARGINS_INVALID", path, "Margins must be an object.");
    return;
  }
  for (const field of ["top", "right", "bottom", "left"]) {
    if (!isFiniteNumber(value[field]) || value[field] < 0) {
      addError(errors, "MARGIN_VALUE_INVALID", `${path}.${field}`, `${field} must be a non-negative finite number.`);
    }
  }
};

const validateLinks = (
  value: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void => {
  if (!Array.isArray(value)) {
    addError(errors, "LINKS_INVALID", path, "links must be an array.");
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (!isRecord(entry)) {
      addError(errors, "LINK_INVALID", entryPath, "link must be an object.");
      return;
    }
    if (!isNonEmptyString(entry.id)) addError(errors, "LINK_ID_INVALID", `${entryPath}.id`, "link id must be non-empty.");
    else if (ids.has(entry.id)) addError(errors, "LINK_ID_DUPLICATE", `${entryPath}.id`, "link id is duplicated.");
    else ids.add(entry.id);
    validateLocalized(entry.label, `${entryPath}.label`, errors, warnings);
    if (!isNonEmptyString(entry.url)) addError(errors, "LINK_URL_INVALID", `${entryPath}.url`, "link url must be non-empty.");
  });
};

const validateContacts = (
  value: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void => {
  if (!Array.isArray(value)) {
    addError(errors, "CONTACTS_INVALID", path, "contacts must be an array.");
    return;
  }
  const ids = new Set<string>();
  const contactTypes = ["email", "phone", "location", "website", "social", "other"];
  value.forEach((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (!isRecord(entry)) {
      addError(errors, "CONTACT_INVALID", entryPath, "contact must be an object.");
      return;
    }
    if (!isNonEmptyString(entry.id)) addError(errors, "CONTACT_ID_INVALID", `${entryPath}.id`, "contact id must be non-empty.");
    else if (ids.has(entry.id)) addError(errors, "CONTACT_ID_DUPLICATE", `${entryPath}.id`, "contact id is duplicated.");
    else ids.add(entry.id);
    if (!contactTypes.includes(String(entry.type))) addError(errors, "CONTACT_TYPE_INVALID", `${entryPath}.type`, "Unsupported contact type.");
    validateLocalized(entry.value, `${entryPath}.value`, errors, warnings);
    if (entry.label !== undefined) validateLocalized(entry.label, `${entryPath}.label`, errors, warnings);
    if (entry.url !== undefined && typeof entry.url !== "string") addError(errors, "CONTACT_URL_INVALID", `${entryPath}.url`, "contact url must be a string when present.");
    if (!isBoolean(entry.visible)) addError(errors, "CONTACT_VISIBILITY_INVALID", `${entryPath}.visible`, "contact visible must be a boolean.");
  });
};

const validateLocalized = (
  value: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void => {
  if (!isRecord(value)) {
    addError(errors, "LOCALIZED_TEXT_INVALID", path, "Localized text must be an object.");
    return;
  }
  if (!isNonEmptyString(value.defaultLocale)) {
    addError(errors, "LOCALE_INVALID", `${path}.defaultLocale`, "defaultLocale must be a non-empty string.");
  }
  if (!isRecord(value.values)) {
    addError(errors, "LOCALIZED_VALUES_INVALID", `${path}.values`, "Localized values must be an object.");
    return;
  }
  for (const [locale, text] of Object.entries(value.values)) {
    if (!isNonEmptyString(locale) || typeof text !== "string") {
      addError(errors, "LOCALIZED_VALUE_INVALID", `${path}.values.${locale}`, "Localized values must map locale strings to strings.");
    }
  }
  if (isNonEmptyString(value.defaultLocale) && typeof value.values[value.defaultLocale] !== "string") {
    addWarning(warnings, "LOCALE_FALLBACK_MISSING", path, "The default locale has no value and will render as empty.");
  }
};

const validateDateRange = (
  value: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  required: boolean,
): void => {
  if (value === undefined && !required) return;
  if (!isRecord(value)) {
    addError(errors, "DATE_RANGE_INVALID", path, "date range must be an object.");
    return;
  }
  for (const field of ["start", "end"]) if (value[field] !== undefined && typeof value[field] !== "string") addError(errors, "DATE_RANGE_FIELD_INVALID", `${path}.${field}`, `${field} must be a string when present.`);
  if (value.isCurrent !== undefined && !isBoolean(value.isCurrent)) addError(errors, "DATE_RANGE_CURRENT_INVALID", `${path}.isCurrent`, "isCurrent must be a boolean when present.");
  if (value.display !== undefined) validateLocalized(value.display, `${path}.display`, errors, warnings);
};

const validateLocalizedArray = (
  value: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void => {
  if (!Array.isArray(value)) {
    addError(errors, "LOCALIZED_ARRAY_INVALID", path, "value must be an array of localized text.");
    return;
  }
  value.forEach((entry, index) => validateLocalized(entry, `${path}.${index}`, errors, warnings));
};

const validateItemFields = (
  item: UnknownRecord,
  sectionType: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void => {
  const localized = (field: string, required = true): void => {
    if (item[field] === undefined && !required) return;
    validateLocalized(item[field], `${path}.${field}`, errors, warnings);
  };
  if (sectionType === "experience") {
    localized("role");
    localized("company");
    localized("location", false);
    validateDateRange(item.period, `${path}.period`, errors, warnings, true);
    validateLocalizedArray(item.bullets, `${path}.bullets`, errors, warnings);
    validateLinks(item.links, `${path}.links`, errors, warnings);
  } else if (sectionType === "education") {
    localized("institution");
    localized("degree", false);
    localized("fieldOfStudy", false);
    localized("location", false);
    validateDateRange(item.period, `${path}.period`, errors, warnings, true);
    validateLocalizedArray(item.details, `${path}.details`, errors, warnings);
  } else if (sectionType === "projects") {
    localized("name");
    localized("role", false);
    localized("description", false);
    validateDateRange(item.period, `${path}.period`, errors, warnings, false);
    validateLocalizedArray(item.bullets, `${path}.bullets`, errors, warnings);
    validateLinks(item.links, `${path}.links`, errors, warnings);
  } else if (sectionType === "skills") {
    localized("name");
    if (item.level !== undefined && !["beginner", "intermediate", "advanced", "expert"].includes(String(item.level))) addError(errors, "SKILL_LEVEL_INVALID", `${path}.level`, "Unsupported skill level.");
    if (!Array.isArray(item.keywords) || item.keywords.some((keyword) => typeof keyword !== "string")) addError(errors, "SKILL_KEYWORDS_INVALID", `${path}.keywords`, "keywords must be an array of strings.");
  } else if (sectionType === "certifications") {
    localized("name");
    localized("issuer", false);
    for (const field of ["issuedAt", "expiresAt", "credentialUrl"]) if (item[field] !== undefined && typeof item[field] !== "string") addError(errors, "CERTIFICATION_FIELD_INVALID", `${path}.${field}`, `${field} must be a string when present.`);
  } else if (sectionType === "languages") {
    localized("language");
    localized("proficiency", false);
  }
};

const validateBounds = (
  bounds: unknown,
  path: string,
  page: UnknownRecord,
  errors: ValidationError[],
  warnings: ValidationWarning[],
): void => {
  if (!isRecord(bounds)) {
    addError(errors, "BOUNDS_INVALID", path, "Layout bounds must be an object.");
    return;
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (!isFiniteNumber(bounds[key])) {
      addError(errors, "BOUNDS_NUMBER_INVALID", `${path}.${key}`, "Layout bounds must contain finite numbers.");
    }
  }
  if (isFiniteNumber(bounds.width) && bounds.width <= 0) {
    addError(errors, "BOUNDS_WIDTH_INVALID", `${path}.width`, "Layout width must be greater than zero.");
  }
  if (isFiniteNumber(bounds.height) && bounds.height <= 0) {
    addError(errors, "BOUNDS_HEIGHT_INVALID", `${path}.height`, "Layout height must be greater than zero.");
  }
  const allowOverflow = page.allowOverflow === true;
  const pageSize = isRecord(page.size) ? page.size : undefined;
  const pageWidth = pageSize && isFiniteNumber(pageSize.widthMm) ? pageSize.widthMm : undefined;
  const pageHeight = pageSize && isFiniteNumber(pageSize.heightMm) ? pageSize.heightMm : undefined;
  if (!allowOverflow && pageWidth !== undefined && pageHeight !== undefined && isFiniteNumber(bounds.x) && isFiniteNumber(bounds.y) && isFiniteNumber(bounds.width) && isFiniteNumber(bounds.height)) {
    if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > pageWidth || bounds.y + bounds.height > pageHeight) {
      addError(errors, "BOUNDS_OUTSIDE_PAGE", path, "Node bounds exceed the page boundary.");
    }
    const margins = isRecord(page.margins) ? page.margins : undefined;
    if (margins && ["top", "right", "bottom", "left"].every((field) => isFiniteNumber(margins[field]))) {
      const top = margins.top as number;
      const right = margins.right as number;
      const bottom = margins.bottom as number;
      const left = margins.left as number;
      const insideSafeArea = bounds.x >= left && bounds.y >= top && bounds.x + bounds.width <= pageWidth - right && bounds.y + bounds.height <= pageHeight - bottom;
      if (!insideSafeArea) addWarning(warnings, "BOUNDS_OUTSIDE_SAFE_AREA", path, "Node is outside the page safe margin.");
    }
  }
};

const validatePageSize = (
  size: unknown,
  path: string,
  errors: ValidationError[],
): void => {
  if (!isRecord(size)) {
    addError(errors, "PAGE_SIZE_INVALID", path, "Page size must be an object.");
    return;
  }
  if (!["A4", "LETTER", "LEGAL", "CUSTOM"].includes(String(size.preset))) {
    addError(errors, "PAGE_PRESET_INVALID", `${path}.preset`, "Unsupported page preset.");
  }
  if (!["portrait", "landscape"].includes(String(size.orientation))) {
    addError(errors, "PAGE_ORIENTATION_INVALID", `${path}.orientation`, "Unsupported page orientation.");
  }
  if (!isFiniteNumber(size.widthMm) || size.widthMm <= 0) {
    addError(errors, "PAGE_WIDTH_INVALID", `${path}.widthMm`, "Page width must be a positive finite number.");
  }
  if (!isFiniteNumber(size.heightMm) || size.heightMm <= 0) {
    addError(errors, "PAGE_HEIGHT_INVALID", `${path}.heightMm`, "Page height must be a positive finite number.");
  }
};

const validateBinding = (
  binding: unknown,
  path: string,
  sections: Map<string, UnknownRecord>,
  customBlocks: Set<string>,
  errors: ValidationError[],
): void => {
  if (!isRecord(binding) || !isNonEmptyString(binding.kind)) {
    addError(errors, "BINDING_INVALID", path, "Layout binding must have a kind.");
    return;
  }
  if (binding.kind === "profile") {
    if (!["name", "headline", "summary", "contacts"].includes(String(binding.field))) {
      addError(errors, "PROFILE_BINDING_INVALID", `${path}.field`, "Profile binding references an unknown field.");
    }
    return;
  }
  if (binding.kind === "section" || binding.kind === "section-item") {
    if (!isNonEmptyString(binding.sectionId) || !sections.has(binding.sectionId)) {
      addError(errors, "SECTION_BINDING_MISSING", `${path}.sectionId`, "Layout binding references a missing section.");
      return;
    }
    if (binding.kind === "section-item") {
      const section = sections.get(binding.sectionId);
      const items = section?.items;
      if (!isRecord(items) || !isNonEmptyString(binding.itemId) || !items[binding.itemId]) {
        addError(errors, "ITEM_BINDING_MISSING", `${path}.itemId`, "Layout binding references a missing section item.");
      }
    }
    return;
  }
  if (binding.kind === "content-block") {
    if (!isNonEmptyString(binding.blockId) || !customBlocks.has(binding.blockId)) {
      addError(errors, "CONTENT_BLOCK_BINDING_MISSING", `${path}.blockId`, "Layout binding references a missing content block.");
    }
    return;
  }
  addError(errors, "BINDING_KIND_INVALID", `${path}.kind`, "Unsupported layout binding kind.");
};

export function validateResumeDocument(document: unknown): ResumeValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!isRecord(document)) {
    return {
      valid: false,
      errors: [{ code: "DOCUMENT_INVALID", path: "$", message: "ResumeDocument must be a JSON object." }],
      warnings,
    };
  }

  if (document.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    addError(errors, "SCHEMA_VERSION_UNSUPPORTED", "schemaVersion", `Expected schema version ${CURRENT_SCHEMA_VERSION}.`);
  }
  if (!isNonEmptyString(document.documentId)) {
    addError(errors, "DOCUMENT_ID_INVALID", "documentId", "documentId must be a non-empty string.");
  }
  if (!Number.isInteger(document.revision) || Number(document.revision) < 0) {
    addError(errors, "REVISION_INVALID", "revision", "revision must be a non-negative integer.");
  }
  if (!isNonEmptyString(document.defaultLocale)) {
    addError(errors, "DEFAULT_LOCALE_INVALID", "defaultLocale", "defaultLocale must be a non-empty string.");
  }
  if (!Array.isArray(document.supportedLocales) || document.supportedLocales.some((locale) => !isNonEmptyString(locale))) {
    addError(errors, "SUPPORTED_LOCALES_INVALID", "supportedLocales", "supportedLocales must contain non-empty locale strings.");
  } else {
    const locales = new Set(document.supportedLocales);
    if (locales.size !== document.supportedLocales.length) addError(errors, "SUPPORTED_LOCALES_DUPLICATE", "supportedLocales", "supportedLocales must not contain duplicates.");
    if (isNonEmptyString(document.defaultLocale) && !locales.has(document.defaultLocale)) addError(errors, "DEFAULT_LOCALE_NOT_SUPPORTED", "supportedLocales", "supportedLocales must include defaultLocale.");
  }
  if (!isRecord(document.metadata)) {
    addError(errors, "METADATA_INVALID", "metadata", "metadata must be an object.");
  } else {
    validateLocalized(document.metadata.title, "metadata.title", errors, warnings);
    for (const field of ["createdAt", "updatedAt"]) if (!isNonEmptyString(document.metadata[field])) addError(errors, "METADATA_DATE_INVALID", `metadata.${field}`, `${field} must be a non-empty date string.`);
    if (document.metadata.variantOf !== undefined && !isNonEmptyString(document.metadata.variantOf)) addError(errors, "METADATA_VARIANT_INVALID", "metadata.variantOf", "variantOf must be a document id when present.");
    if (document.metadata.jobTarget !== undefined) {
      if (!isRecord(document.metadata.jobTarget)) addError(errors, "JOB_TARGET_INVALID", "metadata.jobTarget", "jobTarget must be an object.");
      else {
        for (const field of ["title", "company", "description"]) if (document.metadata.jobTarget[field] !== undefined) validateLocalized(document.metadata.jobTarget[field], `metadata.jobTarget.${field}`, errors, warnings);
        if (!Array.isArray(document.metadata.jobTarget.keywords) || document.metadata.jobTarget.keywords.some((keyword) => typeof keyword !== "string")) addError(errors, "JOB_KEYWORDS_INVALID", "metadata.jobTarget.keywords", "jobTarget keywords must be an array of strings.");
      }
    }
  }

  const content = document.content;
  const sections = new Map<string, UnknownRecord>();
  const customBlocks = new Set<string>();
  const assetIds = new Set<string>();
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  if (!isRecord(content)) {
    addError(errors, "CONTENT_INVALID", "content", "content must be an object.");
  } else {
    validateLocalized(content.profile && isRecord(content.profile) ? content.profile.name : undefined, "content.profile.name", errors, warnings);
    if (content.profile && isRecord(content.profile)) {
      for (const field of ["headline", "summary"]) {
        if (content.profile[field] !== undefined) validateLocalized(content.profile[field], `content.profile.${field}`, errors, warnings);
      }
      validateContacts(content.profile.contacts, "content.profile.contacts", errors, warnings);
      validateLinks(content.profile.links, "content.profile.links", errors, warnings);
    }
    if (!isRecord(content.sections)) {
      addError(errors, "SECTIONS_INVALID", "content.sections", "sections must be an object map.");
    } else {
      for (const [key, sectionValue] of Object.entries(content.sections)) {
        if (!isRecord(sectionValue)) {
          addError(errors, "SECTION_INVALID", `content.sections.${key}`, "section must be an object.");
          continue;
        }
        const id = sectionValue.id;
        if (!isNonEmptyString(id)) addError(errors, "SECTION_ID_INVALID", `content.sections.${key}.id`, "section id must be non-empty.");
        if (key !== id) addError(errors, "SECTION_KEY_MISMATCH", `content.sections.${key}`, "section map key must equal section.id.");
        if (isNonEmptyString(id)) {
          if (sectionIds.has(id)) addError(errors, "SECTION_ID_DUPLICATE", `content.sections.${key}.id`, "section id is duplicated.");
          sectionIds.add(id);
          sections.set(id, sectionValue);
        }
        validateLocalized(sectionValue.title, `content.sections.${key}.title`, errors, warnings);
        if (!isBoolean(sectionValue.visible)) addError(errors, "SECTION_VISIBILITY_INVALID", `content.sections.${key}.visible`, "section visible must be a boolean.");
        if (!["experience", "education", "projects", "skills", "certifications", "languages", "custom"].includes(String(sectionValue.type))) {
          addError(errors, "SECTION_TYPE_INVALID", `content.sections.${key}.type`, "Unsupported section type.");
        }
        if (sectionValue.type === "custom") {
          const blockIds = new Set<string>();
          if (isRecord(sectionValue.blocks)) {
            for (const [blockKey, block] of Object.entries(sectionValue.blocks)) {
              if (!isRecord(block)) {
                addError(errors, "BLOCK_INVALID", `content.sections.${key}.blocks.${blockKey}`, "block must be an object.");
                continue;
              }
              if (!isNonEmptyString(block.id)) addError(errors, "BLOCK_ID_INVALID", `content.sections.${key}.blocks.${blockKey}.id`, "block id must be non-empty.");
              else {
                if (blockKey !== block.id) addError(errors, "BLOCK_KEY_MISMATCH", `content.sections.${key}.blocks.${blockKey}`, "block map key must equal block.id.");
                if (blockIds.has(block.id)) addError(errors, "BLOCK_ID_DUPLICATE", `content.sections.${key}.blocks.${blockKey}.id`, "block id is duplicated.");
                if (customBlocks.has(block.id)) addError(errors, "BLOCK_ID_DUPLICATE", `content.sections.${key}.blocks.${blockKey}.id`, "block id is duplicated across custom sections.");
                blockIds.add(block.id);
                customBlocks.add(block.id);
              }
              if (!["paragraph", "heading", "list", "quote"].includes(String(block.kind))) addError(errors, "BLOCK_KIND_INVALID", `content.sections.${key}.blocks.${blockKey}.kind`, "Unsupported block kind.");
              validateLocalized(block.text, `content.sections.${key}.blocks.${blockKey}.text`, errors, warnings);
              if (block.items !== undefined) {
                if (!Array.isArray(block.items)) addError(errors, "BLOCK_ITEMS_INVALID", `content.sections.${key}.blocks.${blockKey}.items`, "block items must be an array.");
                else block.items.forEach((item, index) => validateLocalized(item, `content.sections.${key}.blocks.${blockKey}.items.${index}`, errors, warnings));
              }
            }
          } else addError(errors, "BLOCKS_INVALID", `content.sections.${key}.blocks`, "custom section blocks must be an object map.");
          validateOrder(sectionValue.blockOrder, `content.sections.${key}.blockOrder`, blockIds, errors);
          if (blockIds.size === 0) addWarning(warnings, "EMPTY_SECTION", `content.sections.${key}`, "Custom section has no content blocks.");
        }
        else if (isRecord(sectionValue.items)) {
          const itemIdsInSection = new Set<string>();
          for (const [itemKey, item] of Object.entries(sectionValue.items)) {
            if (!isRecord(item)) {
              addError(errors, "ITEM_INVALID", `content.sections.${key}.items.${itemKey}`, "item must be an object.");
              continue;
            }
            if (!isNonEmptyString(item.id)) addError(errors, "ITEM_ID_INVALID", `content.sections.${key}.items.${itemKey}.id`, "item id must be non-empty.");
            if (itemKey !== item.id) addError(errors, "ITEM_KEY_MISMATCH", `content.sections.${key}.items.${itemKey}`, "item map key must equal item.id.");
            if (isNonEmptyString(item.id)) {
              if (itemIds.has(item.id)) addError(errors, "ITEM_ID_DUPLICATE", `content.sections.${key}.items.${itemKey}.id`, "item id is duplicated.");
              itemIds.add(item.id);
              itemIdsInSection.add(item.id);
            }
            validateItemFields(item, sectionValue.type, `content.sections.${key}.items.${itemKey}`, errors, warnings);
          }
          validateOrder(sectionValue.itemOrder, `content.sections.${key}.itemOrder`, itemIdsInSection, errors);
          if (itemIdsInSection.size === 0) addWarning(warnings, "EMPTY_SECTION", `content.sections.${key}`, "Section has no items.");
        } else {
          addError(errors, "ITEMS_INVALID", `content.sections.${key}.items`, "items must be an object map.");
        }
      }
    }
    if (!Array.isArray(content.sectionOrder)) {
      addError(errors, "SECTION_ORDER_INVALID", "content.sectionOrder", "sectionOrder must be an array.");
    } else {
      const seen = new Set<string>();
      content.sectionOrder.forEach((id, index) => {
        if (!isNonEmptyString(id) || !sections.has(id)) addError(errors, "SECTION_ORDER_REFERENCE_INVALID", `content.sectionOrder.${index}`, "sectionOrder references a missing section.");
        if (isNonEmptyString(id) && seen.has(id)) addError(errors, "SECTION_ORDER_DUPLICATE", `content.sectionOrder.${index}`, "sectionOrder contains a duplicate.");
        if (isNonEmptyString(id)) seen.add(id);
      });
      for (const id of sections.keys()) if (!seen.has(id)) addError(errors, "SECTION_ORDER_ENTRY_MISSING", "content.sectionOrder", `Section ${id} is missing from sectionOrder.`);
    }
    if (!isRecord(content.assets)) addError(errors, "ASSETS_INVALID", "content.assets", "assets must be an object map.");
    else for (const [key, asset] of Object.entries(content.assets)) {
      if (!isRecord(asset)) {
        addError(errors, "ASSET_INVALID", `content.assets.${key}`, "asset must be an object.");
        continue;
      }
      if (!isNonEmptyString(asset.assetId)) addError(errors, "ASSET_ID_INVALID", `content.assets.${key}.assetId`, "assetId must be non-empty.");
      if (isNonEmptyString(asset.assetId)) {
        if (assetIds.has(asset.assetId)) addError(errors, "ASSET_ID_DUPLICATE", `content.assets.${key}.assetId`, "assetId is duplicated.");
        assetIds.add(asset.assetId);
        if (key !== asset.assetId) addError(errors, "ASSET_KEY_MISMATCH", `content.assets.${key}`, "asset map key must equal asset.assetId.");
      }
      if (asset.alt !== undefined) validateLocalized(asset.alt, `content.assets.${key}.alt`, errors, warnings);
      for (const field of ["width", "height"]) if (asset[field] !== undefined && (!isFiniteNumber(asset[field]) || asset[field] <= 0)) addError(errors, "ASSET_DIMENSION_INVALID", `content.assets.${key}.${field}`, `${field} must be positive when present.`);
    }
    const profileRecord = isRecord(content.profile) ? content.profile : undefined;
    if (profileRecord && isRecord(profileRecord.avatar) && isNonEmptyString(profileRecord.avatar.assetId) && !assetIds.has(profileRecord.avatar.assetId)) addError(errors, "AVATAR_ASSET_INVALID", "content.profile.avatar.assetId", "avatar references a missing asset.");
  }

  const layout = document.layout;
  if (!isRecord(layout)) {
    addError(errors, "LAYOUT_INVALID", "layout", "layout must be an object.");
  } else {
    if (!["flow", "freeform"].includes(String(layout.mode))) addError(errors, "LAYOUT_MODE_INVALID", "layout.mode", "Unsupported layout mode.");
    if (!isNonEmptyString(layout.templateId)) addError(errors, "TEMPLATE_ID_INVALID", "layout.templateId", "templateId must be non-empty.");
    const pages = new Map<string, UnknownRecord>();
    const pageIds = new Set<string>();
    if (!isRecord(layout.pages)) {
      addError(errors, "PAGES_INVALID", "layout.pages", "pages must be an object map.");
    } else {
      for (const [key, pageValue] of Object.entries(layout.pages)) {
        if (!isRecord(pageValue)) {
          addError(errors, "PAGE_INVALID", `layout.pages.${key}`, "page must be an object.");
          continue;
        }
        const id = pageValue.id;
        if (!isNonEmptyString(id)) addError(errors, "PAGE_ID_INVALID", `layout.pages.${key}.id`, "page id must be non-empty.");
        if (key !== id) addError(errors, "PAGE_KEY_MISMATCH", `layout.pages.${key}`, "page map key must equal page.id.");
        if (isNonEmptyString(id)) {
          if (pageIds.has(id)) addError(errors, "PAGE_ID_DUPLICATE", `layout.pages.${key}.id`, "page id is duplicated.");
          pageIds.add(id);
          pages.set(id, pageValue);
        }
        validatePageSize(pageValue.size, `layout.pages.${key}.size`, errors);
        validateMargins(pageValue.margins, `layout.pages.${key}.margins`, errors);
        if (!isRecord(pageValue.background)) addError(errors, "PAGE_BACKGROUND_INVALID", `layout.pages.${key}.background`, "background must be an object.");
        else if (pageValue.background.assetId !== undefined && (!isNonEmptyString(pageValue.background.assetId) || !assetIds.has(pageValue.background.assetId))) addError(errors, "PAGE_BACKGROUND_ASSET_INVALID", `layout.pages.${key}.background.assetId`, "background references a missing asset.");
        if (!isBoolean(pageValue.allowOverflow)) addError(errors, "PAGE_OVERFLOW_INVALID", `layout.pages.${key}.allowOverflow`, "allowOverflow must be a boolean.");
        if (!Array.isArray(pageValue.nodeOrder)) addError(errors, "NODE_ORDER_INVALID", `layout.pages.${key}.nodeOrder`, "nodeOrder must be an array.");
      }
    }
    if (!Array.isArray(layout.pageOrder)) {
      addError(errors, "PAGE_ORDER_INVALID", "layout.pageOrder", "pageOrder must be an array.");
    } else {
      const seenPages = new Set<string>();
      layout.pageOrder.forEach((id, index) => {
        if (!isNonEmptyString(id) || !pages.has(id)) addError(errors, "PAGE_ORDER_REFERENCE_INVALID", `layout.pageOrder.${index}`, "pageOrder references a missing page.");
        if (isNonEmptyString(id) && seenPages.has(id)) addError(errors, "PAGE_ORDER_DUPLICATE", `layout.pageOrder.${index}`, "pageOrder contains a duplicate.");
        if (isNonEmptyString(id)) seenPages.add(id);
      });
      for (const id of pages.keys()) if (!seenPages.has(id)) addError(errors, "PAGE_ORDER_ENTRY_MISSING", "layout.pageOrder", `Page ${id} is missing from pageOrder.`);
    }
    const nodes = isRecord(layout.nodes) ? layout.nodes : undefined;
    if (!nodes) {
      addError(errors, "NODES_INVALID", "layout.nodes", "nodes must be an object map.");
    } else {
      const nodeIds = new Set<string>();
      for (const [key, nodeValue] of Object.entries(nodes)) {
        if (!isRecord(nodeValue)) {
          addError(errors, "NODE_INVALID", `layout.nodes.${key}`, "node must be an object.");
          continue;
        }
        const id = nodeValue.id;
        if (!isNonEmptyString(id)) addError(errors, "NODE_ID_INVALID", `layout.nodes.${key}.id`, "node id must be non-empty.");
        if (key !== id) addError(errors, "NODE_KEY_MISMATCH", `layout.nodes.${key}`, "node map key must equal node.id.");
        if (isNonEmptyString(id)) {
          if (nodeIds.has(id)) addError(errors, "NODE_ID_DUPLICATE", `layout.nodes.${key}.id`, "node id is duplicated.");
          nodeIds.add(id);
        }
        if (!isNonEmptyString(nodeValue.pageId) || !pages.has(nodeValue.pageId)) addError(errors, "NODE_PAGE_REFERENCE_INVALID", `layout.nodes.${key}.pageId`, "node references a missing page.");
        const page = pages.get(String(nodeValue.pageId));
        if (page) validateBounds(nodeValue.bounds, `layout.nodes.${key}.bounds`, page, errors, warnings);
        if (!isFiniteNumber(nodeValue.rotationDeg)) addError(errors, "NODE_ROTATION_INVALID", `layout.nodes.${key}.rotationDeg`, "rotationDeg must be finite.");
        if (!isFiniteNumber(nodeValue.zIndex)) addError(errors, "NODE_Z_INDEX_INVALID", `layout.nodes.${key}.zIndex`, "zIndex must be finite.");
        if (!isBoolean(nodeValue.locked)) addError(errors, "NODE_LOCKED_INVALID", `layout.nodes.${key}.locked`, "locked must be a boolean.");
        if (!isBoolean(nodeValue.visible)) addError(errors, "NODE_VISIBLE_INVALID", `layout.nodes.${key}.visible`, "visible must be a boolean.");
        if (!isRecord(nodeValue.style)) addError(errors, "NODE_STYLE_INVALID", `layout.nodes.${key}.style`, "style must be an object.");
        const kind = String(nodeValue.kind);
        if (!["section", "section-item", "text", "image", "divider", "shape"].includes(kind)) {
          addError(errors, "NODE_KIND_INVALID", `layout.nodes.${key}.kind`, "Unsupported layout node kind.");
        } else if (kind === "section" || kind === "section-item" || kind === "text") {
          validateBinding(nodeValue.binding, `layout.nodes.${key}.binding`, sections, customBlocks, errors);
        } else if (kind === "image") {
          if (!isNonEmptyString(nodeValue.assetId) || !assetIds.has(nodeValue.assetId)) addError(errors, "NODE_ASSET_INVALID", `layout.nodes.${key}.assetId`, "image node must reference an existing asset.");
          if (!["contain", "cover"].includes(String(nodeValue.fit))) addError(errors, "NODE_FIT_INVALID", `layout.nodes.${key}.fit`, "Unsupported image fit.");
        } else if (kind === "divider" && !["horizontal", "vertical"].includes(String(nodeValue.orientation))) {
          addError(errors, "NODE_ORIENTATION_INVALID", `layout.nodes.${key}.orientation`, "Unsupported divider orientation.");
        } else if (kind === "shape" && !["rectangle", "circle", "line"].includes(String(nodeValue.shape))) {
          addError(errors, "NODE_SHAPE_INVALID", `layout.nodes.${key}.shape`, "Unsupported shape.");
        }
      }
      const listedNodeIds = new Set<string>();
      for (const [pageKey, page] of pages) {
        if (!Array.isArray(page.nodeOrder)) continue;
        const seen = new Set<string>();
        page.nodeOrder.forEach((nodeId, index) => {
          if (!isNonEmptyString(nodeId) || !nodes[nodeId]) addError(errors, "PAGE_NODE_REFERENCE_INVALID", `layout.pages.${pageKey}.nodeOrder.${index}`, "page references a missing node.");
          else listedNodeIds.add(nodeId);
          if (isNonEmptyString(nodeId) && seen.has(nodeId)) addError(errors, "PAGE_NODE_DUPLICATE", `layout.pages.${pageKey}.nodeOrder.${index}`, "page nodeOrder contains a duplicate.");
          if (isNonEmptyString(nodeId)) seen.add(nodeId);
          const node = isNonEmptyString(nodeId) && isRecord(nodes[nodeId]) ? nodes[nodeId] : undefined;
          if (node && node.pageId !== pageKey) addError(errors, "NODE_PAGE_MISMATCH", `layout.pages.${pageKey}.nodeOrder.${index}`, "node pageId does not match the containing page.");
        });
      }
      for (const nodeId of nodeIds) if (!listedNodeIds.has(nodeId)) addError(errors, "NODE_NOT_LISTED", `layout.nodes.${nodeId}`, "node is not listed on any page.");
    }
    if (!isRecord(layout.snap)) addError(errors, "SNAP_INVALID", "layout.snap", "snap must be an object.");
    else {
      if (!isBoolean(layout.snap.enabled)) addError(errors, "SNAP_ENABLED_INVALID", "layout.snap.enabled", "snap.enabled must be a boolean.");
      if (!isFiniteNumber(layout.snap.gridMm) || layout.snap.gridMm <= 0) addError(errors, "SNAP_GRID_INVALID", "layout.snap.gridMm", "snap.gridMm must be positive.");
      if (!isBoolean(layout.snap.showGuides)) addError(errors, "SNAP_GUIDES_INVALID", "layout.snap.showGuides", "snap.showGuides must be a boolean.");
    }
  }

  const theme = document.theme;
  if (!isRecord(theme)) {
    addError(errors, "THEME_INVALID", "theme", "theme must be an object.");
  } else {
    for (const field of ["id", "templateId"]) if (!isNonEmptyString(theme[field])) addError(errors, "THEME_FIELD_INVALID", `theme.${field}`, `${field} must be a non-empty string.`);
    if (!Number.isInteger(theme.version) || Number(theme.version) <= 0) addError(errors, "THEME_VERSION_INVALID", "theme.version", "theme.version must be a positive integer.");
    if (!isBoolean(theme.atsFriendly)) addError(errors, "THEME_ATS_INVALID", "theme.atsFriendly", "atsFriendly must be a boolean.");
    if (!isRecord(theme.palette)) addError(errors, "THEME_PALETTE_INVALID", "theme.palette", "theme.palette must be an object.");
    else for (const field of ["background", "surface", "text", "mutedText", "accent", "border"]) if (!isNonEmptyString(theme.palette[field])) addError(errors, "THEME_COLOR_INVALID", `theme.palette.${field}`, `${field} must be a non-empty color token.`);
    if (!isRecord(theme.typography)) addError(errors, "THEME_TYPOGRAPHY_INVALID", "theme.typography", "theme.typography must be an object.");
    else {
      for (const field of ["bodyFont", "headingFont"]) if (!isNonEmptyString(theme.typography[field])) addError(errors, "THEME_FONT_INVALID", `theme.typography.${field}`, `${field} must be a non-empty string.`);
      if (!isFiniteNumber(theme.typography.baseSizePt) || theme.typography.baseSizePt <= 0) addError(errors, "THEME_BASE_SIZE_INVALID", "theme.typography.baseSizePt", "baseSizePt must be positive.");
      if (!isFiniteNumber(theme.typography.scale) || theme.typography.scale <= 0) addError(errors, "THEME_SCALE_INVALID", "theme.typography.scale", "scale must be positive.");
    }
    if (!isFiniteNumber(theme.spacingUnitMm) || theme.spacingUnitMm <= 0) addError(errors, "THEME_SPACING_INVALID", "theme.spacingUnitMm", "spacingUnitMm must be positive.");
    if (!isFiniteNumber(theme.radiusMm) || theme.radiusMm < 0) addError(errors, "THEME_RADIUS_INVALID", "theme.radiusMm", "radiusMm cannot be negative.");
  }

  if (warnings.length === 0 && isRecord(content) && isRecord(content.sections) && Object.keys(content.sections).length === 0) {
    addWarning(warnings, "NO_SECTIONS", "content.sections", "Document has no content sections yet.");
  }
  return { valid: errors.length === 0, errors, warnings };
}
