<template>
  <goa-textarea
    :name="name"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :error="error"
    :rows="rows"
    :maxlength="maxLength"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabelledBy"
    :aria-describedby="ariaDescribedBy"
    @_change="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * GoabTextarea - Vue wrapper for goa-textarea web component with v-model support
 *
 * @example
 * <GoabTextarea v-model="comments" name="comments" :rows="4" placeholder="Enter comments" />
 */

defineProps<{
  modelValue?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  error?: boolean
  rows?: number
  maxLength?: number
  ariaLabel?: string
  ariaLabelledBy?: string
  ariaDescribedBy?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function handleChange(event: CustomEvent) {
  const value = event.detail?.value ?? (event.target as HTMLTextAreaElement)?.value
  emit('update:modelValue', String(value))
}
</script>
