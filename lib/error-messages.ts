/**
 * Centralized error and success message keys for i18n
 *
 * These keys map to translations in locales/en.json and locales/es-ES.json
 * Usage: Use getTranslations() to resolve keys to localized strings
 */

export const ErrorMessages = {
  /**
   * Authentication and authorization errors
   */
  AUTH: {
    INVALID_CREDENTIALS: 'errors.auth.invalidCredentials',
    EMAIL_NOT_VERIFIED: 'errors.auth.emailNotVerified',
    ACCOUNT_LOCKED: 'errors.auth.accountLocked',
    SESSION_EXPIRED: 'errors.auth.sessionExpired',
    UNAUTHORIZED: 'errors.auth.unauthorized',
    FORBIDDEN: 'errors.auth.forbidden',
    TOKEN_INVALID: 'errors.auth.tokenInvalid',
    TOKEN_EXPIRED: 'errors.auth.tokenExpired',
  },

  /**
   * Validation errors (with parameters)
   */
  VALIDATION: {
    REQUIRED_FIELD: (field: string) => ({ key: 'validation.required', values: { field } }),
    INVALID_FORMAT: (field: string) => ({ key: 'validation.invalidFormat', values: { field } }),
    MIN_LENGTH: (field: string, min: number) => ({ key: 'validation.minLength', values: { field, min } }),
    MAX_LENGTH: (field: string, max: number) => ({ key: 'validation.maxLength', values: { field, max } }),
    INVALID_EMAIL: 'validation.invalidEmail',
    INVALID_DATE: 'validation.invalidDate',
    INVALID_URL: 'validation.invalidUrl',
    INVALID_COLOR: 'validation.invalidColor',
  },

  /**
   * Password errors
   */
  PASSWORD: {
    TOO_SHORT: (min: number) => ({ key: 'errors.password.tooShort', values: { min } }),
    TOO_LONG: (max: number) => ({ key: 'errors.password.tooLong', values: { max } }),
    REQUIRES_UPPERCASE: 'errors.password.requiresUppercase',
    REQUIRES_LOWERCASE: 'errors.password.requiresLowercase',
    REQUIRES_NUMBER: 'errors.password.requiresNumber',
    REQUIRES_SPECIAL: 'errors.password.requiresSpecial',
    CURRENT_INCORRECT: 'errors.password.currentIncorrect',
    RESET_EXPIRED: 'errors.password.resetExpired',
    RESET_COOLDOWN: (seconds: number) => ({ key: 'errors.password.resetCooldown', values: { seconds } }),
  },

  /**
   * Email errors
   */
  EMAIL: {
    ALREADY_EXISTS: 'errors.email.alreadyExists',
    NOT_FOUND: 'errors.email.notFound',
    VERIFICATION_SENT: 'errors.email.verificationSent',
    VERIFICATION_EXPIRED: 'errors.email.verificationExpired',
    ALREADY_VERIFIED: 'errors.email.alreadyVerified',
    SEND_FAILED: 'errors.email.sendFailed',
    VERIFY_COOLDOWN: (seconds: number) => ({ key: 'errors.email.verifyCooldown', values: { seconds } }),
  },

  /**
   * Database/Resource errors
   */
  RESOURCE: {
    NOT_FOUND: (resource: string) => ({ key: 'errors.resource.notFound', values: { resource } }),
    ALREADY_EXISTS: (resource: string) => ({ key: 'errors.resource.alreadyExists', values: { resource } }),
    CREATE_FAILED: (resource: string) => ({ key: 'errors.resource.createFailed', values: { resource } }),
    UPDATE_FAILED: (resource: string) => ({ key: 'errors.resource.updateFailed', values: { resource } }),
    DELETE_FAILED: (resource: string) => ({ key: 'errors.resource.deleteFailed', values: { resource } }),
    FORBIDDEN: (resource: string) => ({ key: 'errors.resource.forbidden', values: { resource } }),
  },

  /**
   * Person-specific errors
   */
  PERSON: {
    NOT_FOUND: 'errors.person.notFound',
    ALREADY_EXISTS: 'errors.person.alreadyExists',
    RELATIONSHIP_REQUIRED: 'errors.person.relationshipRequired',
    BASE_CONNECTION_NOT_FOUND: 'errors.person.baseConnectionNotFound',
    CANNOT_DELETE_WITH_RELATIONSHIPS: 'errors.person.cannotDeleteWithRelationships',
  },

  /**
   * Group-specific errors
   */
  GROUP: {
    NOT_FOUND: 'errors.group.notFound',
    ALREADY_EXISTS: 'errors.group.alreadyExists',
    NAME_REQUIRED: 'errors.group.nameRequired',
    CANNOT_DELETE_WITH_MEMBERS: 'errors.group.cannotDeleteWithMembers',
  },

  /**
   * Relationship-specific errors
   */
  RELATIONSHIP: {
    NOT_FOUND: 'errors.relationship.notFound',
    ALREADY_EXISTS: 'errors.relationship.alreadyExists',
    SAME_PERSON: 'errors.relationship.samePerson',
    TYPE_NOT_FOUND: 'errors.relationship.typeNotFound',
    CIRCULAR_DEPENDENCY: 'errors.relationship.circularDependency',
  },

  /**
   * Rate limiting errors
   */
  RATE_LIMIT: {
    EXCEEDED: (minutes: number) => ({ key: 'errors.rateLimit.exceeded', values: { minutes } }),
    LOGIN_EXCEEDED: 'errors.rateLimit.loginExceeded',
    REGISTRATION_EXCEEDED: 'errors.rateLimit.registrationExceeded',
  },

  /**
   * Import/Export errors
   */
  DATA: {
    IMPORT_FAILED: 'errors.data.importFailed',
    EXPORT_FAILED: 'errors.data.exportFailed',
    INVALID_FORMAT: 'errors.data.invalidFormat',
    FILE_TOO_LARGE: (maxMB: number) => ({ key: 'errors.data.fileTooLarge', values: { maxMB } }),
    PARSE_ERROR: 'errors.data.parseError',
  },

  /**
   * General server errors
   */
  SERVER: {
    INTERNAL_ERROR: 'errors.server.internalError',
    SERVICE_UNAVAILABLE: 'errors.server.serviceUnavailable',
    DATABASE_ERROR: 'errors.server.databaseError',
    NETWORK_ERROR: 'errors.server.networkError',
    TIMEOUT: 'errors.server.timeout',
  },

  /**
   * Request errors
   */
  REQUEST: {
    INVALID_JSON: 'errors.request.invalidJson',
    PAYLOAD_TOO_LARGE: (maxMB: number) => ({ key: 'errors.request.payloadTooLarge', values: { maxMB } }),
    MISSING_HEADER: (header: string) => ({ key: 'errors.request.missingHeader', values: { header } }),
    INVALID_METHOD: (method: string) => ({ key: 'errors.request.invalidMethod', values: { method } }),
  },

  /**
   * Feature-specific errors
   */
  FEATURE: {
    NOT_IMPLEMENTED: 'errors.feature.notImplemented',
    DISABLED: 'errors.feature.disabled',
    REQUIRES_UPGRADE: 'errors.feature.requiresUpgrade',
  },
} as const;

/**
 * Success messages
 */
export const SuccessMessages = {
  AUTH: {
    REGISTERED: 'success.auth.registered',
    LOGIN: 'success.auth.login',
    LOGOUT: 'success.auth.logout',
    EMAIL_VERIFIED: 'success.auth.emailVerified',
    PASSWORD_RESET_SENT: 'success.auth.passwordResetSent',
    PASSWORD_RESET: 'success.auth.passwordReset',
    PASSWORD_CHANGED: 'success.auth.passwordChanged',
  },

  PROFILE: {
    UPDATED: 'success.profile.updated',
    EMAIL_CHANGED: 'success.profile.emailChanged',
    THEME_CHANGED: 'success.profile.themeChanged',
    SETTINGS_UPDATED: 'success.profile.settingsUpdated',
  },

  PERSON: {
    CREATED: 'success.person.created',
    UPDATED: 'success.person.updated',
    DELETED: 'success.person.deleted',
  },

  GROUP: {
    CREATED: 'success.group.created',
    UPDATED: 'success.group.updated',
    DELETED: 'success.group.deleted',
    MEMBER_ADDED: 'success.group.memberAdded',
    MEMBER_REMOVED: 'success.group.memberRemoved',
  },

  RELATIONSHIP: {
    CREATED: 'success.relationship.created',
    UPDATED: 'success.relationship.updated',
    DELETED: 'success.relationship.deleted',
  },

  DATA: {
    EXPORTED: 'success.data.exported',
    IMPORTED: 'success.data.imported',
  },
} as const;
