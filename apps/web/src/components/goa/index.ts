/**
 * GoA Component Wrappers
 *
 * Vue wrappers for @abgov/web-components providing:
 * - Proper TypeScript support
 * - v-model binding for form inputs
 * - Vue event handling
 */

export { default as GoabButton } from './GoabButton.vue'
export { default as GoabInput } from './GoabInput.vue'
export { default as GoabModal } from './GoabModal.vue'
export { default as GoabDropdown } from './GoabDropdown.vue'
export { default as GoabTextarea } from './GoabTextarea.vue'
export { default as GoabCheckbox } from './GoabCheckbox.vue'
export { default as GoabRadioGroup } from './GoabRadioGroup.vue'
// GoabCallout removed - use <goa-callout> directly (no event bridging needed)
