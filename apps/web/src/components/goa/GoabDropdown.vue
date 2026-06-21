<template>
  <goa-dropdown
    :name="name"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :error="error"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabelledBy"
    :native="native"
    @_change="handleChange"
  >
    <slot />
  </goa-dropdown>
</template>

<script setup lang="ts">
/**
 * GoabDropdown - Vue wrapper for goa-dropdown web component with v-model support
 *
 * @example
 * <GoabDropdown v-model="selected" name="status" placeholder="Select a status">
 *   <goa-dropdown-item value="active" label="Active" />
 *   <goa-dropdown-item value="inactive" label="Inactive" />
 * </GoabDropdown>
 */

defineProps<{
  modelValue?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  error?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  native?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function handleChange(event: CustomEvent) {
  const value = event.detail?.value ?? (event.target as HTMLSelectElement)?.value
  emit('update:modelValue', String(value))
}
</script>
